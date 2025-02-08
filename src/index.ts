import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { createDecisionHandler } from "./handlers/createDecisionHandler";
import { getNextComparisonHandler } from "./handlers/getNextComparisonHandler";

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());

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

app.post("/decisions", createDecisionHandler);
app.get("/decisions/:decisionId/comparisons/next", getNextComparisonHandler);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
