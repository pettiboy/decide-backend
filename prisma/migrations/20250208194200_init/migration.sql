-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "choices" (
    "id" SERIAL NOT NULL,
    "decision_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparisons" (
    "id" SERIAL NOT NULL,
    "decision_id" TEXT NOT NULL,
    "choice1_id" INTEGER NOT NULL,
    "choice2_id" INTEGER NOT NULL,
    "winner_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranked_choices" (
    "id" SERIAL NOT NULL,
    "decision_id" TEXT NOT NULL,
    "choice_id" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "ranked_choices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ranked_choices_decision_id_rank_key" ON "ranked_choices"("decision_id", "rank");

-- AddForeignKey
ALTER TABLE "choices" ADD CONSTRAINT "choices_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_choice1_id_fkey" FOREIGN KEY ("choice1_id") REFERENCES "choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_choice2_id_fkey" FOREIGN KEY ("choice2_id") REFERENCES "choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "choices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranked_choices" ADD CONSTRAINT "ranked_choices_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranked_choices" ADD CONSTRAINT "ranked_choices_choice_id_fkey" FOREIGN KEY ("choice_id") REFERENCES "choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
