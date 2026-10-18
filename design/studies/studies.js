const arrow =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>';
const back =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12H5m6-6-6 6 6 6" stroke="currentColor" stroke-width="1.5"/></svg>';
const example = {
  goal: 'Walk for 30 minutes',
  done: 'Spend 30 minutes walking outside.',
  deadline: '2026-10-19T20:00',
  pledge: 'Give up Netflix for the next two evenings.',
  pledgeCheck: '2026-10-21T21:00',
};
let draft = { ...example };
let confirmed = null;
let direction;
let screen;
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const path = (view, theme = direction) => `?direction=${theme}&screen=${view}`;
const dateText = (value) => {
  if (!value) return 'Choose a time';
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))} · ${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'pm' : 'am'}`;
};
const dataLink = (view, text, cls = 'text-link') =>
  `<a class="${cls}" href="${path(view)}" data-view="${view}">${text}</a>`;
function controls() {
  document.getElementById('study-controls').innerHTML =
    `<nav class="study-controls" aria-label="Design study controls"><div class="study-inner"><div class="study-label"><span>Terms Apply / Design studies</span><div class="study-group" aria-label="Direction">${['print', 'plain'].map((d, i) => `<a href="${path(screen, d)}" data-theme="${d}" ${direction === d ? 'aria-current="true"' : ''}>${i ? 'B · Plain' : 'A · Print'}</a>`).join('')}</div></div><div class="study-group screens" aria-label="Screen"><a href="${path('landing')}" data-view="landing" ${screen === 'landing' ? 'aria-current="page"' : ''}>Landing</a><a href="${path('new')}" data-view="new" ${screen !== 'landing' ? 'aria-current="page"' : ''}>New commitment</a></div></div></nav>`;
}
function header() {
  return `<header class="site-header shell">${dataLink('landing', 'terms apply<span class="brand-period">.</span>', 'brand')}<nav class="site-nav" aria-label="Main">${screen === 'landing' ? '<a href="#how">How it works</a>' : dataLink('landing', 'About')}<a href="https://termsapply.me/auth" target="_blank" rel="noopener">Sign in ${arrow}</a></nav></header>`;
}
function footer() {
  return `<footer class="site-footer shell"><p>Private records. Self-reported outcomes.</p><a href="https://termsapply.me/privacy" target="_blank" rel="noopener">Privacy</a></footer>`;
}
function landing() {
  const plain = direction === 'plain';
  return `<main id="main" class="shell"><section class="landing-hero"><div class="hero-copy"><p class="intro-label">A private commitment, in writing.</p><h1>${plain ? 'A goal.<br>With terms.' : 'Put a date<br>on it.'}</h1><p class="hero-description">Choose what you’ll do, when you’ll do it, and your pledge if you miss it.</p>${dataLink('new', `Make a commitment ${arrow}`, 'button')}<p class="hero-small">Free to use. Email reminders are optional.</p></div><figure class="hero-figure"><img class="hero-image" src="./assets/walk-still-life.png" alt="A canvas walking shoe resting on a stack of calendar pages, against a red background." width="1536" height="1024"><figcaption><span class="mono">THE EXAMPLE / 01</span><span>A 30-minute walk. Tomorrow, before 8 pm.</span></figcaption></figure><article class="example-agreement" aria-label="Example agreement"><div class="example-heading"><span>An example</span><span class="mono">01 / AGREEMENT</span></div><h2>Walk for 30 minutes.</h2><dl><div><dt>Done means</dt><dd>30 minutes walking outside.</dd></div><div><dt>Deadline</dt><dd>Tomorrow, before 8 pm.</dd></div><div class="example-pledge"><dt>If missed</dt><dd>No Netflix for the next two evenings.</dd></div><div><dt>Pledge check-in</dt><dd>After those two evenings.</dd></div></dl>${dataLink('new', `Use this example ${arrow}`)}</article></section><section class="landing-rule"><strong>We’ll ask how it went.</strong><p>Opt in to email reminders and check-ins. You report the outcome; we keep the original terms and your answers.</p></section><section class="how" id="how" aria-labelledby="how-title"><div class="how-heading"><p class="mono">HOW IT WORKS</p><h2 id="how-title">The terms are yours.</h2><p>Your pledge should be manageable and additional to your usual obligations.</p></div><ol><li><span class="mono">01</span><div><h3>Choose something specific.</h3><p>A task you can finish, a clear definition of done, and a deadline.</p></div></li><li><span class="mono">02</span><div><h3>Decide your pledge.</h3><p>Choose what you’ll do or give up if you miss the deadline, and when you can report on it.</p></div></li><li><span class="mono">03</span><div><h3>Record what happened.</h3><p>On time, late, or missed. Late and missed goals get a separate pledge check-in. An unanswered check-in stays unreported.</p></div></li></ol></section></main>`;
}
function details(data = draft) {
  return `<div><dt>Done means</dt><dd data-summary="done">${escape(data.done || 'Define what counts as done.')}</dd></div><div><dt>Deadline</dt><dd data-summary="deadline">${escape(dateText(data.deadline))}</dd></div><div><dt>Your pledge, if missed</dt><dd data-summary="pledge">${escape(data.pledge || 'Choose your own pledge.')}</dd></div><div><dt>Pledge check-in</dt><dd data-summary="pledgeCheck">${escape(dateText(data.pledgeCheck))}</dd></div>`;
}
function aside() {
  return `<aside class="draft-aside" aria-label="Draft summary"><p class="aside-label mono">${screen === 'agreement' ? 'SAMPLE RECORD' : 'YOUR DRAFT'}</p><h2 data-summary="goal">${escape(draft.goal || 'Your goal')}</h2><dl class="draft-details">${details()}</dl><p class="aside-footnote">The pledge is separate from the goal. Finishing late still means the deadline was missed.</p></aside>`;
}
function form() {
  return `<form id="commitment-form" class="agreement-form"><div class="field-block"><div class="field-heading"><span class="mono">01</span><label for="goal">What will you do?</label></div><input id="goal" name="goal" value="${escape(draft.goal)}" maxlength="180" minlength="3" required autocomplete="off"></div><div class="field-block"><div class="field-heading"><span class="mono">02</span><label for="done">What counts as done?</label></div><textarea id="done" name="done" rows="2" maxlength="700" minlength="3" required>${escape(draft.done)}</textarea></div><div class="field-block"><div class="field-heading"><span class="mono">03</span><label for="deadline">By when?</label></div><input type="datetime-local" id="deadline" name="deadline" value="${escape(draft.deadline)}" required><p class="timezone">Asia/Kolkata · UTC+05:30</p></div><div class="field-block"><div class="field-heading"><span class="mono">04</span><label for="pledge">Your pledge, if missed</label></div><p class="field-note" id="pledge-help">Something manageable, beyond what you already need to do.</p><textarea id="pledge" name="pledge" rows="2" maxlength="700" minlength="3" aria-describedby="pledge-help" required>${escape(draft.pledge)}</textarea></div><div class="field-block"><div class="field-heading"><span class="mono">05</span><label for="pledgeCheck">When can you report on your pledge?</label></div><p class="field-note" id="check-help">Leave enough time to carry it out. Two evenings without Netflix need two evenings.</p><input type="datetime-local" id="pledgeCheck" name="pledgeCheck" value="${escape(draft.pledgeCheck)}" aria-describedby="check-help" required><p class="timezone">Asia/Kolkata · UTC+05:30</p></div><div class="form-bottom"><p>You can edit everything before confirming.</p><button class="button" type="submit">Review terms ${arrow}</button></div></form>`;
}
function review() {
  return `<div><dl class="review-sheet"><div><dt>Your goal</dt><dd>${escape(draft.goal)}</dd></div>${details()}</dl><p class="timezone">All times in Asia/Kolkata · UTC+05:30</p><label class="review-consent"><input type="checkbox" id="consent"><span>Keep these as the original terms of this sample agreement.</span></label><p class="review-footnote">Confirming does not charge money or take action on your behalf.</p><div class="form-bottom review-actions">${dataLink('new', `${back} Edit draft`, 'text-link')}<button class="button" id="confirm-sample" disabled>Confirm sample ${arrow}</button></div></div>`;
}
function agreement() {
  const data = confirmed || draft;
  return `<div><div class="sample-confirmation"><h2>Sample agreement confirmed.</h2><p>This is a design study. Nothing has been saved to your account.</p></div><p class="sample-status">Not reported</p><dl class="review-sheet"><div><dt>Your goal</dt><dd>${escape(data.goal)}</dd></div>${details(data)}</dl><p class="timezone">All times in Asia/Kolkata · UTC+05:30</p><div class="form-bottom"><a class="button" href="https://termsapply.me/new" target="_blank" rel="noopener">Make a real commitment ${arrow}</a></div></div>`;
}
function newPage() {
  const title =
    screen === 'review'
      ? 'Review your terms'
      : screen === 'agreement'
        ? 'Your commitment'
        : 'New commitment';
  const subtitle =
    screen === 'review'
      ? 'Check the whole agreement before confirming.'
      : screen === 'agreement'
        ? 'The original terms and the outcome belong in the same record.'
        : 'Set the terms. You’ll review them before confirming.';
  return `<main id="main" class="shell new-page">${dataLink('landing', `${back} About Terms Apply`, 'breadcrumb')}<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${screen !== 'agreement' ? `<ol class="stages" aria-label="Progress"><li class="${screen === 'new' ? 'active' : ''}" ${screen === 'new' ? 'aria-current="step"' : ''}><span>01</span>Write</li><li class="${screen === 'review' ? 'active' : ''}" ${screen === 'review' ? 'aria-current="step"' : ''}><span>02</span>Review</li></ol>` : ''}</div><div class="workbench">${screen === 'new' ? form() : screen === 'review' ? review() : agreement()}${aside()}</div><p class="study-note">Design study · Example dates and details · No account data is read or saved.</p></main>`;
}
function navigate(view, theme = direction) {
  history.pushState({}, '', path(view, theme));
  render();
  window.scrollTo(0, 0);
  document.querySelector('h1')?.setAttribute('tabindex', '-1');
  document.querySelector('h1')?.focus({ preventScroll: true });
}
function render() {
  const query = new URLSearchParams(location.search);
  direction = query.get('direction') === 'plain' ? 'plain' : 'print';
  screen = ['new', 'review', 'agreement'].includes(query.get('screen'))
    ? query.get('screen')
    : 'landing';
  document.body.dataset.direction = direction;
  document.title = `Terms Apply — ${direction === 'print' ? 'Print' : 'Plain'} study`;
  controls();
  document.getElementById('app').innerHTML =
    header() + (screen === 'landing' ? landing() : newPage()) + footer();
  document
    .getElementById('commitment-form')
    ?.addEventListener('submit', (e) => {
      e.preventDefault();
      const pledgeCheck = document.getElementById('pledgeCheck');
      pledgeCheck.setCustomValidity(
        draft.pledgeCheck <= draft.deadline
          ? 'Choose a pledge check-in after the goal deadline.'
          : '',
      );
      if (!e.target.reportValidity()) return;
      navigate('review');
    });
  document.getElementById('consent')?.addEventListener('change', (e) => {
    document.getElementById('confirm-sample').disabled = !e.target.checked;
  });
  document.getElementById('confirm-sample')?.addEventListener('click', () => {
    if (!document.getElementById('consent')?.checked) return;
    confirmed = { ...draft };
    navigate('agreement');
    document.getElementById('announcements').textContent =
      'Sample agreement confirmed. Nothing has been saved to your account.';
  });
  for (const input of document.querySelectorAll(
    '#commitment-form input, #commitment-form textarea',
  )) {
    input.addEventListener('input', (e) => {
      draft[e.target.name] = e.target.value;
      document.getElementById('pledgeCheck').setCustomValidity('');
      const output = document.querySelector(
        `[data-summary="${e.target.name}"]`,
      );
      if (output)
        output.textContent = ['deadline', 'pledgeCheck'].includes(e.target.name)
          ? dateText(e.target.value)
          : e.target.value || '—';
    });
  }
}
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-view], a[data-theme]');
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(link.dataset.view || screen, link.dataset.theme || direction);
});
window.addEventListener('popstate', render);
render();
