import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { createDecisionHandler } from "./handlers/createDecisionHandler";
import { getNextComparisonHandler } from "./handlers/getNextComparisonHandler";
import { submitComparisonHandler } from "./handlers/submitComparisonHandler";
import { getResultsHandler } from "./handlers/getResultsHandler";
import cors from "cors";
import { authMiddleware } from "./middleware/authMiddleware";
import { generateTitleHandler } from "./handlers/generateTitleHandler";
import { getMyDecisionsHandler } from "./handlers/getMyDecisionsHandler";
import { getDecisionVoterCountHandler } from "./handlers/getDecisionVoterCountHandler";

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());

// cors
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? ["https://decide.pettiboy.com"]
    : ["https://decide.pettiboy.com", "http://localhost:5173"];
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  },
};
app.use(cors(corsOptions));

app.get("/", async (req: Request, res: Response) => {
  try {
    await prisma.$connect();
    res.send("Hello, Decide Backend! Database connected.");
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).send("Error connecting to database.");
  } finally {
    await prisma.$disconnect();
  }
});

// Protected routes
app.post(
  "/decisions/:decisionId/comparisons",
  authMiddleware,
  submitComparisonHandler
);
app.get(
  "/decisions/:decisionId/comparisons/next",
  authMiddleware,
  getNextComparisonHandler
);
app.get("/decisions/:decisionId/results", authMiddleware, getResultsHandler);

app.post("/decisions", authMiddleware, createDecisionHandler);

app.post("/generate-title", authMiddleware, generateTitleHandler);

app.get("/my-decisions", authMiddleware, getMyDecisionsHandler);

app.get(
  "/decisions/:decisionId/voter-count",
  authMiddleware,
  getDecisionVoterCountHandler
);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
