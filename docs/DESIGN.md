# Terms Apply design

The owner selected **A · Print** on 18 October 2026 after reviewing the two visual studies in `design/studies/`. The reference is thoughtful print advertising: a clear observation, purposeful imagery, firm typesetting, and useful language. The live app should follow this direction consistently; the old cream/green serif treatment is retired.

## Shared system

- **Headlines:** Barlow Condensed, semibold. Use for the wordmark, landing headline, page titles, and short section headings. No decorative italic second line.
- **Working text:** IBM Plex Sans, regular/medium/semibold. Use for user-entered goals in lists, agreement terms, forms, navigation, and explanatory copy. Inputs remain at least 16px on phones.
- **Metadata:** IBM Plex Mono only for small, nonessential numbering. Essential labels use readable sans-serif text; avoid tiny all-caps instructions.
- **Colour:** paper `#faf9f6`, ink `#242622`, muted text `#64655d`, rules `#d6d5cc`, accent `#b63024`. Green/amber status treatments communicate state; they are not the brand palette.
- **Layout:** a shared 1120px content width, deliberate rules, square controls, and clear spacing between decisions. Mobile uses 20px page margins and a single column. User text and long addresses wrap rather than overflow.
- **Interaction:** visible keyboard focus, native labelled inputs, accessible native dialogs, consistent button treatment, and reduced-motion support. Report and confirmation actions stay explicit.

The primary landing photo is the original walking-shoe/calendar-page study. Production uses 768px and 1280px WebP derivatives (about 41KB and 98KB), with responsive image selection. The original and provenance remain in `design/studies/`. Fonts are self-hosted in `public/fonts/`; their Open Font Licenses are in `public/licenses/`. No external font service or image tracking is added.

## Writing

Explain what happens and what to do next. Use humour sparingly, where an observation supports the product. Avoid pleading, superiority, moral judgement, and manufactured motivation. Do not turn every heading into a tagline.

Use literal labels such as **Your commitments**, **New commitment**, **Review your terms**, **History**, **Email reminders**, and **Save report**. Keep explanations beside the decisions they help with. Avoid “tomorrow-you”, “the ball’s in your court”, “a deal’s a deal”, celebratory judgements about honesty, and repeated fragments about intention.

Outcome language must follow `PRODUCT.md`. Reporting late is not completing late. A missed or late goal activates the user's own pledge. Silence is unreported; not yet is unresolved. The app does not independently verify behaviour or enforce consequences.

## Screen behaviour

- Landing: one headline and image, a short explanation, the three product steps, and the complete walking example. Reminder availability reflects configuration.
- Composer: a blank draft by default; an explicit button can load the walking example. A desktop summary updates while editing. Phones retain all five fields and a complete review step without a duplicate sidebar. Focus moves to review or the first invalid field.
- Review: show every term, permit editing, and require acknowledgement before confirmation. Original terms remain immutable after confirmation.
- Dashboard: literal Open / History / All filters; readable goals, deadlines, states, and pledges. Empty states explain how to start.
- Agreement: original terms and timestamped history remain visible. Phones place the next relevant action before the original terms and history. No decorative success score or fabricated progress measurement.
- Goal / pledge / withdrawal dialogs: concise questions, readable controls, notes marked optional, and explicit consequences of recording an answer.
- Accounts / settings / privacy / recovery / errors: the same type, rules, and button system. Account forms remain usable without a decorative panel on phones.
- Email: simple ink/red HTML with a plain-text alternative. System-font fallbacks work in email clients. No customer goal/pledge text, remote imagery or remote fonts in reminders. Hosted Supabase signup/recovery branding needs its dashboard templates applied separately; see DEPLOYMENT.md.

These are working design rules. Further changes should be judged using real app screens on both desktop and phones, rather than a landing headline alone. The original studies remain as design history, not a second production UI.
