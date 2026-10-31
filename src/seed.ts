import "dotenv/config";
import { getDb } from "./db";

const day = 24 * 60 * 60 * 1000;
const at = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * day);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;

const seed = [
  ["Winter Clothes Distribution", "Donation", "Mirpur 10, Dhaka", 3, 10, "photo-1593113598332-cd288d649433",
    "We are collecting and handing out warm sweaters, jackets and socks to families living near the Mirpur 10 roundabout. Bring clean winter clothes or join us to sort and distribute them."],
  ["Blanket Distribution for the Needy", "Donation", "Mohammadpur, Dhaka", 5, 16, "photo-1488521787991-ed7bbaae773c",
    "Cold nights are hard on people sleeping outdoors. Volunteers will walk through Mohammadpur handing out blankets to rickshaw pullers and street families."],
  ["Dhanmondi Lake Cleanup Drive", "Cleanup", "Dhanmondi Lake, Dhaka", 7, 8, "photo-1532629345422-7515f3d16bb6",
    "Gloves and bags are provided. We will clear plastic and litter from the lakeside walkway and sort recyclables together."],
  ["Plant 500 Saplings Along the Riverbank", "Plantation", "Keraniganj, Dhaka", 10, 9, "photo-1542601906990-b4d3fb778b09",
    "Help us plant native saplings along the Buriganga riverbank to hold the soil and bring back shade. Spades and saplings are provided."],
  ["Community Blood Donation Camp", "Blood Drive", "Uttara Sector 7, Dhaka", 12, 10, "photo-1559027615-cd4628902d4a",
    "Certified medical staff will run a safe donation camp. Bring a valid ID, eat beforehand and drink plenty of water."],
  ["Free Reading Class for Street Children", "Education", "Farmgate, Dhaka", 14, 15, "photo-1497633762265-9d179a990aa6",
    "Volunteer teachers needed for a Saturday reading and drawing session for children from nearby communities."],
  ["Free Health Checkup Camp", "Health Camp", "Jatrabari, Dhaka", 18, 9, "photo-1469571486292-0ba58a3f068b",
    "Doctors will offer free blood pressure, sugar and general checkups. Volunteers are needed for registration and queue help."],
] as const;

async function run() {
  const db = await getDb();
  const events = db.collection("events");
  await events.deleteMany({ createdBy: "seed@helpinghands.bd" });
  await events.insertMany(
    seed.map(([title, type, location, days, hour, photo, description]) => ({
      title, type, location, description,
      thumbnail: img(photo),
      date: at(days, hour),
      createdBy: "seed@helpinghands.bd",
      creatorName: "HelpingHands Team",
      createdAt: new Date(),
    }))
  );
  console.log(`Seeded ${seed.length} upcoming events.`);
  process.exit(0);
}
run();
