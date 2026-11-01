import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let indexed = false;

export async function getDb(): Promise<Db> {
  if (!client) {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
    client = new MongoClient(process.env.MONGODB_URI);
  }
  await client.connect(); 
  const db = client.db(process.env.DB_NAME || "community_events");
  if (!indexed) {
    await db.collection("joins").createIndex({ eventId: 1, userEmail: 1 }, { unique: true });
    await db.collection("events").createIndex({ date: 1 });
    indexed = true;
  }
  return db;
}
