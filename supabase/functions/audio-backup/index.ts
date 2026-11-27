import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { createAudioBackupHandler } from "../_shared/nexa-audio-backup-handler.mjs";

// V5.23 CANDIDATE (NOT DEPLOYED). Encrypted clinical audio backup. Default OFF (NEXA_AUDIO_BACKUP must equal "enabled"); never an AI path.
// All logic and tests live in _shared/nexa-audio-backup-handler.mjs (tests/nexa-audio-backup-handler.test.mjs).
Deno.serve(createAudioBackupHandler({ env: (n: string) => Deno.env.get(n), createClient }));
