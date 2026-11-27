import "dotenv/config";

/**
 * Local deploy readiness check — prints key names only, never values.
 *   npx tsx scripts/check-deploy-readiness.ts
 */

const required = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
] as const;

const recommended = [
  "BETTER_AUTH_ALLOWED_ORIGINS",
  "BETTER_AUTH_TELEMETRY",
  "CHECKPOINT_DISABLE",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_FOLDER_MODE",
] as const;

const issues: string[] = [];

for (const key of required) {
  const value = process.env[key];
  if (!value?.trim()) {
    issues.push(`MISSING required ${key}`);
    continue;
  }
  if (key === "DATABASE_URL") {
    if (!/^postgres(ql)?:\/\//.test(value))
      issues.push("DATABASE_URL must be postgresql:// or postgres://");
    if (!/sslmode=require/.test(value))
      issues.push("DATABASE_URL should include sslmode=require");
    if (!/uselibpqcompat=true/.test(value))
      issues.push("DATABASE_URL should include uselibpqcompat=true for Node pg");
  }
  if (key === "BETTER_AUTH_SECRET" && value.length < 32)
    issues.push("BETTER_AUTH_SECRET must be at least 32 characters");
  if (key === "BETTER_AUTH_URL") {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && !url.hostname.includes("localhost"))
        issues.push("BETTER_AUTH_URL for deploy should be https://");
    } catch {
      issues.push("BETTER_AUTH_URL is not a valid URL");
    }
  }
  console.log(`OK  ${key}`);
}

for (const key of recommended) {
  const value = process.env[key];
  if (!value?.trim()) console.log(`WARN  ${key} not set`);
  else console.log(`OK  ${key}`);
}

const cloudinaryKeys = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_FOLDER_MODE",
] as const;
const cloudinarySet = cloudinaryKeys.filter((k) => process.env[k]?.trim());
if (cloudinarySet.length > 0 && cloudinarySet.length < cloudinaryKeys.length) {
  issues.push(
    "Cloudinary is partially configured — set all four CLOUDINARY_* vars for Vercel avatars",
  );
}
if (cloudinarySet.length === 0) {
  console.log(
    "WARN  Cloudinary unset — avatar upload will fail on Vercel (ephemeral FS)",
  );
}

if (issues.length) {
  console.log("\nBLOCKED:");
  for (const issue of issues) console.log(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log("\nDeploy readiness: local env looks complete.");
  console.log(
    "Next: npx vercel login → set project env (Preview+Production) → npx vercel --prod",
  );
  console.log(
    "After first URL is known, set BETTER_AUTH_URL + BETTER_AUTH_ALLOWED_ORIGINS to that HTTPS origin and redeploy.",
  );
}
