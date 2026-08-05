import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const matchStatusEnum = pgEnum("match_status", ["scheduled", "live", "finished"]);

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  sport: text("sport").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  status: matchStatusEnum("status").notNull().default("scheduled"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  homeScore: integer("home_score").notNull().default(0),
  awayScore: integer("away_score").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const commentary = pgTable("commentary", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  minute: integer("minute").notNull(),
  sequence: integer("sequence").notNull(),
  period: text("period").notNull(),
  eventType: text("event_type").notNull(),
  actor: text("actor"),
  team: text("team"),
  message: text("message").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
