export function OnThisDay({ daysSinceSignup }: { daysSinceSignup: number }) {
  const daysToUnlock = Math.max(0, 365 - daysSinceSignup);

  return (
    <section>
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        coming someday,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
        on this day
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-8 max-w-prose">
        a daily playlist of what you were obsessed with on this exact date a
        year, two years, three years ago. needs at least a year of play
        history to be meaningful.
      </p>

      <p className="text-lg leading-relaxed text-[var(--color-text)] mb-10 max-w-prose">
        <span className="marker font-[family-name:var(--font-serif)] italic">
          locked.
        </span>{" "}
        unlocks in{" "}
        <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-accent)]">
          {daysToUnlock} days
        </span>{" "}
        — or instantly, if you upload your full spotify history.
      </p>

      <div className="border-t border-[var(--color-rule)] pt-8 max-w-prose">
        <h3 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-3">
          ⚡ skip the wait
        </h3>
        <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-6">
          spotify will give you your full streaming history if you ask. once
          uploaded here, on this day works back to the day you joined spotify,
          and your eras get verified with real play data.
        </p>

        <ol className="space-y-4 text-base text-[var(--color-text)] leading-relaxed">
          <li className="flex gap-4">
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-faint)] shrink-0 w-8">
              i.
            </span>
            <span>
              go to{" "}
              <a
                href="https://www.spotify.com/account/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="border-b border-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
              >
                spotify.com/account/privacy
              </a>{" "}
              and log in.
            </span>
          </li>
          <li className="flex gap-4">
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-faint)] shrink-0 w-8">
              ii.
            </span>
            <span>
              scroll to <em>download your data</em> and check{" "}
              <em>extended streaming history</em>.{" "}
              <span className="text-[var(--color-text-muted)]">
                the shorter <em>account data</em> option only goes back about
                a year — skip it.
              </span>
            </span>
          </li>
          <li className="flex gap-4">
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-faint)] shrink-0 w-8">
              iii.
            </span>
            <span>request the export, and confirm via the email spotify sends.</span>
          </li>
          <li className="flex gap-4">
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-faint)] shrink-0 w-8">
              iv.
            </span>
            <span>
              wait roughly{" "}
              <span className="font-[family-name:var(--font-serif)] italic">
                thirty days
              </span>
              . spotify will email you a zip when it&apos;s ready.
            </span>
          </li>
          <li className="flex gap-4">
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-faint)] shrink-0 w-8">
              v.
            </span>
            <span>
              unzip and drop the{" "}
              <code className="font-mono text-sm text-[var(--color-accent)]">
                Streaming_History*.json
              </code>{" "}
              files into the upload page.
            </span>
          </li>
        </ol>

        <div className="mt-8">
          <a
            href="/settings/import"
            className="inline-flex items-center gap-2 border-b border-[var(--color-text)] pb-1 text-base text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            open the upload page →
          </a>
          <p className="mt-3 text-sm italic text-[var(--color-text-faint)] font-[family-name:var(--font-serif)]">
            (a small piece of advice — request the export today, even if you
            aren&apos;t ready to upload. by the time you remember, the file
            will already be in your inbox.)
          </p>
        </div>
      </div>
    </section>
  );
}
