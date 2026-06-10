import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

export const chamberEnum = pgEnum("chamber", ["house", "senate"]);

export const votePositionEnum = pgEnum("vote_position", [
  "yea",
  "nay",
  "present",
  "not_voting",
]);

// The 535 voting members of Congress. Departed members are kept with
// inOffice = false so their past votes stay attributed.
export const legislators = pgTable("legislators", {
  id: text("id").primaryKey(), // bioguide_id — the universal federal member key
  fullName: text("full_name").notNull(),
  party: text("party").notNull(),
  state: text("state").notNull(),
  district: text("district"), // null for senators
  chamber: chamberEnum("chamber").notNull(),
  inOffice: boolean("in_office").notNull().default(true),
  photoUrl: text("photo_url"),
  termStart: date("term_start"),
  termEnd: date("term_end"),
});

export const bills = pgTable("bills", {
  id: text("id").primaryKey(), // e.g. "hr-1234-119"
  congress: integer("congress").notNull(),
  billType: text("bill_type").notNull(), // hr, s, hjres, sjres, ...
  number: integer("number").notNull(),
  title: text("title").notNull(),
  shortTitle: text("short_title"),
  summary: text("summary"),
  status: text("status"),
  latestActionDate: date("latest_action_date"),
});

// Every roll call from both chambers, including procedural votes and
// nominations — billId is null for votes not tied to a bill. The UI
// defaults to bill-linked votes.
export const rollCalls = pgTable(
  "roll_calls",
  {
    id: text("id").primaryKey(), // e.g. "house-119-1-123" (chamber-congress-session-roll)
    chamber: chamberEnum("chamber").notNull(),
    congress: integer("congress").notNull(),
    session: integer("session").notNull(),
    rollNumber: integer("roll_number").notNull(),
    voteDate: date("vote_date").notNull(),
    question: text("question").notNull(),
    result: text("result").notNull(),
    billId: text("bill_id").references(() => bills.id),
  },
  (table) => [
    index("roll_calls_bill_id_idx").on(table.billId),
    index("roll_calls_vote_date_idx").on(table.voteDate),
  ],
);

export const votePositions = pgTable(
  "vote_positions",
  {
    rollCallId: text("roll_call_id")
      .notNull()
      .references(() => rollCalls.id),
    legislatorId: text("legislator_id")
      .notNull()
      .references(() => legislators.id),
    position: votePositionEnum("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.rollCallId, table.legislatorId] }),
    index("vote_positions_legislator_id_idx").on(table.legislatorId),
  ],
);
