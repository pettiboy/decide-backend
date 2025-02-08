/*
  Warnings:

  - A unique constraint covering the columns `[decision_id,choice1_id,choice2_id]` on the table `comparisons` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "comparisons_decision_id_choice1_id_choice2_id_key" ON "comparisons"("decision_id", "choice1_id", "choice2_id");
