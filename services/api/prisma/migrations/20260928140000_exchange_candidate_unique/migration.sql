-- CreateIndex
CREATE UNIQUE INDEX "Candidate_vacancyId_practitionerId_key" ON "Candidate"("vacancyId", "practitionerId");
