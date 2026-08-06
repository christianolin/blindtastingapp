import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gitignored scratch: one-off probes and migration generators written
    // during a task and thrown away. Linting them fails the repo-wide run on
    // throwaway code that is not in version control.
    ".superpowers/**",
    ".tiles-build/**",
  ]),

  // Own-authentication guard.
  //
  // Identity now resolves through src/lib/auth (getOptionalUser / requireUser),
  // not through GoTrue. Nothing enforces that on its own: a stray
  // `supabase.auth.getUser()` still compiles AND still returns the right user,
  // because the token we mint is one GoTrue accepts. So the migration would rot
  // silently — and every such call is a hidden dependency on Supabase Auth that
  // Phase 3 has to find by hand. This rule is the only signal.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth/**", "src/lib/supabase/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.property.name='auth'][object.object.name=/^(supabase|admin)$/]",
          message:
            "Supabase Auth is being replaced. Use getOptionalUser() or requireUser() from @/lib/auth/dal instead.",
        },
      ],
    },
  },

  // Temporary exemptions: the remaining GoTrue surface, each owned by a named
  // task. Delete each entry as its task lands — an empty list here is the
  // completion signal for the auth migration.
  //
  // Paths use ** rather than the literal route segment: eslint globs treat
  // `[id]` as a character class, so "src/app/tastings/[id]/actions.ts" silently
  // matches nothing.
  {
    files: [
      // Browser components: they cannot import the server-only DAL, so they
      // wait for Task 12's short-lived browser token.
      "src/app/tastings/**/tasting-add-wine-modal.tsx",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
