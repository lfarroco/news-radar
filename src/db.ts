import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { config } from "https://deno.land/x/dotenv/mod.ts";

const env = config();

export const dbClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_KEY
);

