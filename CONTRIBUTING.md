# Contributing

Thanks for helping. This skill is valuable because every rule is **evidence-based**,
so please keep it that way.

## Adding or changing a rule

1. Describe the failure you actually saw (report line, curl output, Lighthouse audit id).
2. Explain the root cause, not just the symptom.
3. Give the fix, and a way to verify it (a command, a tool check, or a test).
4. Put the short rule in `SKILL.md` and the detail in the matching `references/*.md`.
   Keep `SKILL.md` lean, since it loads into the model's context.

Don't add claims about crawler or tool behaviour you haven't checked. Link the
official source (Google Search Central, Lighthouse source, Semrush KB) where one exists.

## Tools and templates

- Node 18+, **no dependencies** for `templates/tools/*` (they must run with a plain `node`).
- Run `node --check` on every `.mjs`/`.js` you touch. CI does this too.
- Test tools against a real site or build and paste the output in the PR.
- Server configs: validate (`caddy validate`) **and** curl the four cases in
  `references/playbook.md § Serving`.

## Layout

```
.claude-plugin/marketplace.json          marketplace (install: seo-allgreen@seo-allgreen)
plugins/seo-allgreen/.claude-plugin/      plugin manifest (bump "version" on release)
plugins/seo-allgreen/skills/seo-allgreen/  the skill itself
```

Validate before a PR: `claude plugin validate .`
