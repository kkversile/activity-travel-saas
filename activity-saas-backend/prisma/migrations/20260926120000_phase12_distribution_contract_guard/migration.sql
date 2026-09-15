-- Phase 12 final guard: one active contract per channel, enforced by PostgreSQL.
CREATE UNIQUE INDEX "ChannelContract_one_active_per_channel_key"
  ON "ChannelContract"("channelId")
  WHERE "status" = 'ACTIVE'::"ChannelContractStatus";
