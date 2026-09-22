# Live cloud sync — setup (free)

This makes your budget sync live between you and your wife, hosted on a free
URL, behind a Google sign-in locked to your two emails. All on Firebase's free
(Spark) tier — no card, no monthly fee at this usage.

Until you finish step 2, the app stays 100% local exactly as it is now.

## 1. Create a Firebase project (2 min)

1. Go to <https://console.firebase.google.com> → **Add project**. Name it
   anything (e.g. `forbord-financials`). You can disable Analytics.
2. In the project, click the **</>** (Web) icon to "Add a web app". Give it a
   nickname, **don't** check "Firebase Hosting" here. Click Register.
3. It shows a `firebaseConfig = { apiKey: …, authDomain: …, projectId: …, appId: … }`.
   Keep that tab open.

## 2. Paste your config

Open **`src/firebase-config.ts`** and fill in:

- `firebaseConfig` — copy `apiKey`, `authDomain`, `projectId`, `appId` from step 1.3.
- `ALLOWED_EMAILS` — your and your wife's **Google** email addresses.

(The apiKey is safe to commit — it's not a secret; the security rules below are
what actually protect your data.)

## 3. Turn on Google sign-in

Firebase console → **Authentication** → **Get started** → **Sign-in method** →
enable **Google** → Save.

## 4. Create the database + lock it down

1. Console → **Firestore Database** → **Create database** → Production mode →
   pick a location → Enable.
2. Edit **`firestore.rules`** in this repo: replace the two placeholder emails
   with the SAME emails you put in `ALLOWED_EMAILS`.
3. You'll deploy these rules in step 5 (or paste them into console →
   Firestore → Rules → Publish).

## 5. Build & deploy (free hosting)

```bash
cd ~/budget
npm run build
npx firebase-tools login           # opens browser once
npx firebase-tools use --add       # pick the project you created
npx firebase-tools deploy          # deploys the site + the Firestore rules
```

It prints a **Hosting URL** like `https://lumen.web.app`.

## 6. Share it

- Open the URL yourself first, sign in with Google → your existing local data
  uploads to the cloud automatically the first time.
- Send the URL to your wife. She opens it on her laptop, signs in with her
  Google account (must be one of the allowed emails) → she sees the budget, and
  edits from either of you sync live.

## Notes

- **Conflicts:** edits sync at the whole-document level, last-write-wins. For two
  people it's fine; just avoid editing the exact same field at the same instant.
- **Re-deploy after changes:** `npm run build && npx firebase-tools deploy`.
- **Privacy:** your data now lives in your Firebase project (Google Cloud),
  readable only by the two allowed accounts. localStorage still works as an
  offline cache on each device.
