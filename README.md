# Interactive Radio Streamer for Alexa Devices — generic starter template

Adapted from a working radio skill implementation. This is a customizable **starter**, not a turnkey universal streaming skill or a copy of a published Alexa skill.

## Quick setup

1. Open `lambda/index.js`. Search for `INSERT` and `Your Station Name`. Replace the audio stream URL, JSON metadata URL, logo URL, station name, website, Welcome/Help/Exit messages, and optional colors. Do not edit unrelated playback code.
2. The metadata parser expects a MyRadioStream-style HTTPS JSON endpoint with `songtitle` (in the form `Artist - Title`) and `streamstatus=1`. If your provider differs, adapt only `parseMetadata()` to your provider's actual fields. A different stream codec may require testing on Fire TV; the original working station used an AAC stream.
3. The included `composers.json` contains `{}` intentionally. You may add an appropriately licensed catalog keyed by normalized `title|artist`; without a catalog, composer questions receive the built-in honest fallback response.
4. Create or configure an Alexa-hosted custom skill / AWS Lambda environment, install the dependencies from `lambda/package.json`, and deploy the contents of `lambda/` as the Lambda function. Ensure the skill's endpoint points to **your own** Lambda function.
5. Use `interactionModels/custom/en-US.json` as a **sample** model for a new skill. Change its invocation name. For an existing skill, merge the needed intents with that skill's model rather than overwriting it.
6. Test on a real Fire TV and on a screenless Alexa device: launch, stream playback, now-playing refresh, composer and performer questions, help, stop and cancel. Verify native AudioPlayer fallback.
7. Fill in your own skill manifest, publisher information, privacy-policy URL, account-specific identifiers and skill icons in the Alexa Developer Console. No AWS/skill account identifiers are included here.

## Display

Search `#17304F` for navy backgrounds and `#E5D0AC` for champagne-gold text. These are merely example colors. Screen display uses embedded APL in `lambda/index.js`. There is no separate APL document to upload.

## Security / distribution

No API keys, passwords or account-specific AWS IDs are provided. The unused S3 helper and unneeded AWS persistence dependencies have been removed. Never hard-code secrets; use secure environment variables or an approved secrets manager if adding integrations. Run your own secret scan before publishing derivatives.

## Known limits

- No OpenAI API is used by this starter; there is no OpenAI key needed.
- The sample model includes intents handled in this version, not additional BCC-specific commands (donations, program notes, switching stations).
- The 30-second update uses APL polling on supported devices; visual and playback behavior varies by hardware.
- The package has not been deployed under generic placeholder settings; replace placeholders and test before publishing.
- Distributed under the MIT license (see `LICENSE`). Do not add third-party catalogs or artwork unless you have redistribution rights.

## Validation before publishing or deploying

- Run `node --check lambda/index.js` and validate both JSON files.
- Install dependencies with `cd lambda && npm install` (Node.js required).
- Replace *every* station placeholder before deploying. The placeholder URLs will not stream audio.
- Test launch, metadata, playback, questions, help, stop, Fire TV screen refresh, and native fallback on real devices.
- Keep secrets in environment variables or a secrets manager, never in the repository.
- This template has undergone static checks but **has not been deployed as a generic station**.
