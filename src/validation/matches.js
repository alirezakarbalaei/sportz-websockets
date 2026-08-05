import { z } from "zod";

export const MATCH_STATUS = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished",
};

const isoDateString = (fieldName) =>
  z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: `${fieldName} must be a valid ISO date string`,
  });

export const listMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createMatchSchema = z
  .object({
    sport: z.string().min(1, "sport must be a non-empty string"),
    homeTeam: z.string().min(1, "homeTeam must be a non-empty string"),
    awayTeam: z.string().min(1, "awayTeam must be a non-empty string"),
    startTime: isoDateString("startTime"),
    endTime: isoDateString("endTime"),
    homeScore: z.coerce.number().int().nonnegative().optional(),
    awayScore: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    if (Date.parse(data.endTime) <= Date.parse(data.startTime)) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "endTime must be after startTime",
      });
    }
  });

export const updateScoreSchema = z.object({
  homeScore: z.coerce.number().int().nonnegative(),
  awayScore: z.coerce.number().int().nonnegative(),
});
