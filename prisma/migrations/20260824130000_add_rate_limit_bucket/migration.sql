-- Production-readiness fix: rate limiting moves from an in-memory Map to
-- this table. An in-memory bucket does not survive across Vercel
-- serverless function instances, so it would silently stop limiting
-- anything under real multi-instance traffic.
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");
