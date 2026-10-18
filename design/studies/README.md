# Terms Apply: visual studies

Two exploratory directions, made on 18 October 2026. The owner subsequently selected **A · Print**; the production implementation follows `docs/DESIGN.md`. These studies remain as design history. Their files are independent of the production React entry point and contain no account credentials or database integration.

The owner’s reference boards are the starting point: thoughtful vintage advertising, graphic posters, and unusual photographic compositions. The shared brief is coherence, useful writing, readable typography, and restraint. Humour should arise from an observation about the product; avoid motivational slogans, teasing the user, and decorative cleverness.

## Compare the directions

| Study    | Starting point                                 | Type and colour                                                        | Main image                                                    |
| -------- | ---------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| A: Print | A print advertisement with a single clear idea | Barlow Condensed headlines; IBM Plex Sans text; dark ink and vermilion | Original still life: a walking shoe resting on calendar pages |
| B: Plain | A useful personal document                     | IBM Plex Sans with limited Plex Mono metadata; blue ink on white       | The agreement itself, with all five terms visible             |

Both have a landing page, an editable sample commitment, a review step, and a sample confirmation. The example draft is supplied for visual evaluation; the real product must continue to leave the pledge to the user. No sample action creates an account, schedules email, or saves a real commitment. The sample confirmation explicitly identifies this boundary.

The creation screen uses literal headings and places explanations next to decisions that need them. The desktop summary updates as fields change. Mobile removes the duplicate sidebar and retains the complete review step. The sample dates use Asia/Kolkata and are labelled as examples.

## Run and export

From the repository root:

```sh
python3 -m http.server 4175 --bind 127.0.0.1 --directory design/studies
```

The entry point is `design/studies/index.html`; query parameters are `direction=print|plain` and `screen=landing|new|review|agreement`.

Export a single HTML file that can be opened directly in a browser, including offline:

```sh
node design/studies/export.mjs /tmp/terms-apply-design-studies.html
```

The exported file includes the fonts and image, so it needs no installation. Its Sign in, Privacy, and Make a real commitment links open the existing live app. Sample drafts exist only in memory and reset on reload.

## Review evidence

Eight full-page screenshots are in `previews/`: two directions × two screens × desktop (1440 px) / phone (390 px). Chromium rendering and the actual edit → review → edit → sample confirmation interaction were checked in all four direction/device combinations. The confirmation remains disabled without acknowledgement. All eight screen/device combinations passed axe WCAG A/AA checks and horizontal-overflow checks. These are study checks, not a claim that a new production design has been validated.

## Assets

All fonts are self-hosted. Font files were obtained from the official Fontsource npm packages, without changing application dependencies. Their Open Font License files accompany them in `assets/`.

`assets/walk-still-life.png` is an original generated photographic study, created on 18 October 2026 with imagegen. It was commissioned as a single ordinary walking shoe on blank calendar pages against a red background, using the visual language of old print photography. No mood-board artwork was copied into the asset. This is an exploratory visual, not evidence of an endorsed shoe brand or a product feature.

## Decisions still open

- Which direction feels appropriate after viewing both real screens, not just the headline?
- Does the photograph connect the walking example to the product clearly enough?
- Is the form comfortable to read and complete on a phone?
- What, if anything, should feel warmer or more distinctive?

The next implementation should extend the chosen system through the dashboard, agreement detail, goal reports, pledge reports, authentication, settings and email. Preserve the product and access-control rules in `docs/PRODUCT.md`; selecting a visual direction does not authorize changing the meaning of historical records.
