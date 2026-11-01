import "dotenv/config";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import cors from "cors";
import { Document, Filter, ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "./db";
import { requireAuth, AuthedRequest } from "./middleware/auth";

export const EVENT_TYPES = ["Cleanup", "Plantation", "Donation", "Blood Drive", "Education", "Health Camp", "Other"] as const;

const eventSchema = z.object({
  title: z.string().trim().min(5, "Title must be at least 5 characters."),
  description: z.string().trim().min(20, "Description must be at least 20 characters."),
  type: z.enum(EVENT_TYPES, { errorMap: () => ({ message: "Choose an event type." }) }),
  thumbnail: z.string().trim().url("Enter a valid image URL."),
  location: z.string().trim().min(3, "Enter where the event will take place."),
  date: z.coerce
    .date({ errorMap: () => ({ message: "Enter a valid event date." }) })
    .refine((d) => d.getTime() > Date.now(), "The event date must be in the future."),
});

const app = express();
const origins = (process.env.CLIENT_URL || "http://localhost:3000").split(",").map((o) => o.trim().replace(/\/$/, ""));
app.use(cors({ origin: origins }));
app.use(express.json());

type Handler = (req: AuthedRequest, res: Response) => Promise<unknown>;
const h = (fn: Handler): RequestHandler => (req, res, next) => {
  fn(req as AuthedRequest, res).catch(next);
};
const toId = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


async function attachCounts(docs: Document[]): Promise<Document[]> {
  if (!docs.length) return docs;
  const db = await getDb();
  const counts = await db
    .collection("joins")
    .aggregate([{ $match: { eventId: { $in: docs.map((d) => d._id) } } }, { $group: { _id: "$eventId", n: { $sum: 1 } } }])
    .toArray();
  const map = new Map(counts.map((c) => [String(c._id), c.n as number]));
  return docs.map((d) => ({ ...d, joinedCount: map.get(String(d._id)) ?? 0 }));
}

app.get("/", (_req, res) => {
  res.json({ name: "HelpingHands BD API", status: "ok" });
});


app.get(
  "/events",
  h(async (req, res) => {
    const db = await getDb();
    const { limit, type, search } = req.query;
    const filter: Filter<Document> = { date: { $gte: new Date() } };
    if (typeof type === "string" && type && type !== "All") filter.type = type;
    if (typeof search === "string" && search.trim()) {
      filter.title = { $regex: escapeRegex(search.trim()), $options: "i" };
    }
    let cursor = db.collection("events").find(filter).sort({ date: 1 });
    const n = Math.min(parseInt(String(limit), 10) || 0, 50);
    if (n > 0) cursor = cursor.limit(n);
    res.json(await attachCounts(await cursor.toArray()));
  })
);


app.get(
  "/my-events",
  requireAuth,
  h(async (req, res) => {
    const db = await getDb();
    const docs = await db.collection("events").find({ createdBy: req.user!.email }).sort({ date: 1 }).toArray();
    res.json(await attachCounts(docs));
  })
);


app.get(
  "/my-joined",
  requireAuth,
  h(async (req, res) => {
    const db = await getDb();
    const joins = await db.collection("joins").find({ userEmail: req.user!.email }).toArray();
    const joinedAt = new Map(joins.map((j) => [String(j.eventId), j.joinedAt]));
    const docs = await db
      .collection("events")
      .find({ _id: { $in: joins.map((j) => j.eventId) } })
      .sort({ date: 1 })
      .toArray();
    const withCounts = await attachCounts(docs);
    res.json(withCounts.map((d) => ({ ...d, joinedAt: joinedAt.get(String(d._id)) })));
  })
);


app.get(
  "/events/:id",
  h(async (req, res) => {
    const _id = toId(req.params.id);
    const db = await getDb();
    const ev = _id && (await db.collection("events").findOne({ _id }));
    if (!ev) return res.status(404).json({ message: "We couldn't find that event. It may have been removed." });
    const [withCount] = await attachCounts([ev]);
    res.json(withCount);
  })
);


app.get(
  "/events/:id/joined",
  requireAuth,
  h(async (req, res) => {
    const _id = toId(req.params.id);
    if (!_id) return res.json({ joined: false });
    const db = await getDb();
    const found = await db.collection("joins").findOne({ eventId: _id, userEmail: req.user!.email });
    res.json({ joined: !!found });
  })
);


app.post(
  "/events",
  requireAuth,
  h(async (req, res) => {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const db = await getDb();
    const doc = { ...parsed.data, createdBy: req.user!.email, creatorName: req.user!.name, createdAt: new Date() };
    const result = await db.collection("events").insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  })
);


app.put(
  "/events/:id",
  requireAuth,
  h(async (req, res) => {
    const _id = toId(req.params.id);
    if (!_id) return res.status(400).json({ message: "That event id isn't valid." });
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const db = await getDb();
    const ev = await db.collection("events").findOne({ _id });
    if (!ev) return res.status(404).json({ message: "We couldn't find that event." });
    if (ev.createdBy !== req.user!.email) return res.status(403).json({ message: "You can only edit events you created." });
    await db.collection("events").updateOne({ _id }, { $set: parsed.data });
    res.json({ message: "Event updated." });
  })
);


app.delete(
  "/events/:id",
  requireAuth,
  h(async (req, res) => {
    const _id = toId(req.params.id);
    if (!_id) return res.status(400).json({ message: "That event id isn't valid." });
    const db = await getDb();
    const ev = await db.collection("events").findOne({ _id });
    if (!ev) return res.status(404).json({ message: "We couldn't find that event." });
    if (ev.createdBy !== req.user!.email) return res.status(403).json({ message: "You can only delete events you created." });
    await db.collection("events").deleteOne({ _id });
    await db.collection("joins").deleteMany({ eventId: _id });
    res.json({ message: "Event deleted." });
  })
);


app.post(
  "/events/:id/join",
  requireAuth,
  h(async (req, res) => {
    const _id = toId(req.params.id);
    const db = await getDb();
    const ev = _id && (await db.collection("events").findOne({ _id }));
    if (!ev) return res.status(404).json({ message: "We couldn't find that event." });
    if (new Date(ev.date).getTime() < Date.now()) {
      return res.status(400).json({ message: "This event has already taken place." });
    }
    try {
      await db.collection("joins").insertOne({
        eventId: _id,
        eventTitle: ev.title,
        userEmail: req.user!.email,
        userName: req.user!.name,
        joinedAt: new Date(),
      });
      res.status(201).json({ message: "You're in! See you there." });
    } catch (err: any) {
      if (err?.code === 11000) return res.status(409).json({ message: "You've already joined this event." });
      throw err;
    }
  })
);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong on our side. Please try again." });
});

export default app;
