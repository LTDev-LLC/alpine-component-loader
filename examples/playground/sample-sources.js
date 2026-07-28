const DEFAULT_SOURCES = {
    page: String.raw`<demo-dashboard
  product="Northstar"
  workspace="Operations"
  name="Maya Chen"
  job="Operations lead"
  initials="MC">
  <span slot="announcement">Friday overview · All systems are healthy.</span>
  <span>Built from editable AlpineComponentLoader components.</span>
</demo-dashboard>`,
    components: String.raw`<template acl-component="demo-dashboard"
  acl-props='{ "product": "String", "workspace": "String", "name": "String", "job": "String", "initials": "String" }'>
  <div class="demo-app" x-data="{ showAll: false }" x-bind:data-theme="$store.theme.mode"
    x-on:project-toggle="$store.dashboard.handleProjectToggle($event)"
    x-on:task-progress="$store.dashboard.handleTaskProgress($event)"
    x-on:theme-change="$store.dashboard.announceTheme($event.detail.mode)">
    <demo-app-nav x-bind:product="$props.product" x-bind:workspace="$props.workspace">
      <div class="nav-actions" slot="actions">
        <demo-theme-toggle bind-store="theme"></demo-theme-toggle>
        <button class="nav-action" type="button" x-on:click="$store.dashboard.invite()">Invite teammate</button>
      </div>
    </demo-app-nav>

    <main id="dashboard" class="dashboard-shell">
      <section class="dashboard-hero">
        <div>
          <slot name="announcement">
            <span class="overline">Workspace overview</span>
          </slot>
          <h1>Good morning, <span x-text="$props.name.split(' ')[0]"></span>.</h1>
          <p>Keep delivery moving with a live view of projects, workload, and team activity.</p>
          <div class="hero-actions">
            <button id="sample-primary-action" type="button"
              x-on:click="$store.dashboard.createReport()">Create report</button>
            <span id="sample-status" role="status" aria-live="polite"
              x-text="$store.dashboard.status"></span>
          </div>
        </div>
        <demo-profile-card x-bind:name="$props.name" x-bind:job="$props.job"
          x-bind:initials="$props.initials"></demo-profile-card>
      </section>

      <section class="stat-grid" aria-label="Workspace metrics">
        <template x-for="metric in $store.dashboard.metrics" x-bind:key="metric.label">
          <demo-stat-card x-bind:label="metric.label" x-bind:value="metric.value"
            x-bind:trend="metric.trend" x-bind:tone="metric.tone"></demo-stat-card>
        </template>
      </section>

      <div class="dashboard-grid">
        <section id="projects" class="dashboard-panel projects-panel">
          <div class="panel-heading">
            <div>
              <span class="overline">In progress</span>
              <h2>Priority projects</h2>
            </div>
            <button class="quiet-button" type="button" x-on:click="showAll = !showAll"
              x-text="showAll ? 'Show priority' : 'View all'"></button>
          </div>
          <div class="project-list">
            <template x-for="project in (showAll ? $store.dashboard.projects : $store.dashboard.projects.slice(0, 3))"
              x-bind:key="project.title">
              <demo-project-card x-bind:title="project.title" x-bind:owner="project.owner"
                x-bind:progress="project.progress" x-bind:status="project.status"></demo-project-card>
            </template>
          </div>
        </section>

        <aside class="dashboard-rail">
          <demo-task-control total="12" done="8"></demo-task-control>
          <demo-activity-feed title="Recent activity"></demo-activity-feed>
        </aside>
      </div>
    </main>

    <footer class="dashboard-footer">
      <span x-text="$props.product + ' ' + $props.workspace"></span>
      <slot>Built from editable ACL components.</slot>
    </footer>
  </div>
</template>

<template acl-component="demo-app-nav"
  acl-props='{ "product": "String", "workspace": "String" }'>
  <nav class="app-nav" aria-label="Product navigation">
    <a class="brand" href="#dashboard">
      <span class="brand-mark" aria-hidden="true">N</span>
      <span><strong x-text="$props.product"></strong><small x-text="$props.workspace"></small></span>
    </a>
    <div class="nav-links" aria-label="Workspace sections">
      <a class="active" href="#dashboard">Overview</a>
      <a href="#projects">Projects</a>
      <a href="#activity">Activity</a>
    </div>
    <div class="nav-slot"><slot name="actions"></slot></div>
  </nav>
</template>

<template acl-component="demo-theme-toggle" acl-props='{ "mode": "String" }'>
  <button class="theme-toggle" type="button" aria-label="Dark theme"
    x-bind:aria-pressed="$store.theme.mode === 'dark'"
    x-on:click="$store.theme.mode = $store.theme.mode === 'dark' ? 'light' : 'dark';
      $props.$emit('theme-change', { mode: $store.theme.mode })">
    <span class="theme-icon" x-bind:data-mode="$props.mode" aria-hidden="true"></span>
    <span x-text="$store.theme.mode === 'dark' ? 'Dark' : 'Light'"></span>
  </button>
</template>

<template acl-component="demo-stat-card"
  acl-props='{ "label": "String", "value": "String", "trend": "String", "tone": "String" }'>
  <article class="stat-card" x-bind:data-tone="$props.tone">
    <span class="stat-label" x-text="$props.label"></span>
    <strong class="stat-value" x-text="$props.value"></strong>
    <span class="stat-trend" x-text="$props.trend"></span>
  </article>
</template>

<template acl-component="demo-project-card"
  acl-props='{ "title": "String", "owner": "String", "progress": "Number", "status": "String" }'>
  <article class="project-card" x-data="{ watching: false }">
    <div class="project-copy">
      <span class="project-icon" aria-hidden="true"></span>
      <div>
        <h3 x-text="$props.title"></h3>
        <p><span x-text="$props.owner"></span> · <span x-text="$props.status"></span></p>
      </div>
    </div>
    <div class="progress-row">
      <span class="progress-track"><span x-bind:style="'width:' + $props.progress + '%'"></span></span>
      <strong x-text="$props.progress + '%'"></strong>
    </div>
    <button class="watch-button" type="button"
      x-on:click="watching = !watching;
        $props.$emit('project-toggle', { title: $props.title, watching: watching })"
      x-text="watching ? 'Watching' : 'Watch'"></button>
  </article>
</template>

<template acl-component="demo-activity-feed" acl-props='{ "title": "String" }'>
  <section id="activity" class="activity-card">
    <div class="panel-heading">
      <div><span class="overline">Team pulse</span><h2 x-text="$props.title"></h2></div>
      <span class="live-badge">Live</span>
    </div>
    <div class="activity-list">
      <template x-for="activity in $store.dashboard.activities" x-bind:key="activity.person">
        <demo-activity-item x-bind:person="activity.person" x-bind:action="activity.action"
          x-bind:time="activity.time" x-bind:initials="activity.initials"
          x-bind:tone="activity.tone"></demo-activity-item>
      </template>
    </div>
  </section>
</template>

<template acl-component="demo-activity-item"
  acl-props='{ "person": "String", "action": "String", "time": "String", "initials": "String", "tone": "String" }'>
  <div class="activity-item">
    <span class="activity-avatar" x-bind:data-tone="$props.tone" x-text="$props.initials"></span>
    <p><strong x-text="$props.person"></strong><span x-text="$props.action"></span><small x-text="$props.time"></small></p>
  </div>
</template>

<template acl-component="demo-task-control"
  acl-props='{ "total": "Number", "done": "Number" }'>
  <section class="task-card" x-data="{ complete: Number($props.done) }">
    <span class="overline">Today</span>
    <h2>Daily progress</h2>
    <p><strong x-text="complete"></strong> of <span x-text="$props.total"></span> priority tasks completed.</p>
    <div class="task-progress"><span x-bind:style="'width:' + ((complete / $props.total) * 100) + '%'"></span></div>
    <button type="button" x-on:click="complete = Math.min($props.total, complete + 1);
      $props.$emit('task-progress', { complete: complete, total: $props.total })"
      x-bind:disabled="complete >= $props.total">Complete next task</button>
  </section>
</template>

<template id="demo-profile-template">
  <style>
    :host { display: block; min-width: 220px; font-family: inherit; }
    .profile { display: flex; align-items: center; gap: 12px; padding: 14px;
      border: 1px solid var(--profile-border, rgba(255,255,255,.22)); border-radius: 14px;
      background: var(--profile-bg, rgba(255,255,255,.1)); color: var(--profile-text, white);
      backdrop-filter: blur(10px); }
    .avatar { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%;
      background: linear-gradient(135deg,#bfdbfe,#c4b5fd); color: #1e1b4b; font-weight: 900; }
    strong, span { display: block; }
    span { color: var(--profile-muted, #bfdbfe); font-size: 12px; }
  </style>
  <div class="profile">
    <span class="avatar" x-text="$props.initials"></span>
    <div><strong x-text="$props.name"></strong><span x-text="$props.job"></span></div>
  </div>
</template>`,
    css: String.raw`:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #eef2f7;
}

html, body, * { box-sizing: border-box; }
body { margin: 0; min-width: 320px; background: #eef2f7; }
button, a { font: inherit; }
button { cursor: pointer; }
button:focus-visible, a:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
demo-dashboard, demo-app-nav, demo-theme-toggle, demo-stat-card, demo-project-card,
demo-activity-feed, demo-activity-item, demo-task-control, demo-profile-card { display: block; }

.demo-app {
  --page: #eef2f7;
  --surface: #ffffff;
  --surface-soft: #f8fafc;
  --surface-hover: #f1f5f9;
  --text: #172033;
  --muted: #64748b;
  --line: #dbe4ef;
  --line-soft: #e2e8f0;
  --primary: #1d4ed8;
  --primary-hover: #1e40af;
  --primary-soft: #eff6ff;
  --focus: #60a5fa;
  --success: #047857;
  --hero-start: #0f172a;
  --hero-end: #1e3a8a;
  --hero-text: #ffffff;
  --hero-muted: #cbd5e1;
  --hero-accent: #93c5fd;
  --shadow: 0 1px 3px rgba(15,23,42,.08);
  --hero-shadow: 0 22px 48px rgba(15,23,42,.2);
  min-height: 100vh;
  color-scheme: light;
  color: var(--text);
  background: var(--page);
  transition: color .2s ease, background-color .2s ease;
}

.demo-app[data-theme="dark"] {
  --page: #090f1d;
  --surface: #111827;
  --surface-soft: #172033;
  --surface-hover: #1e293b;
  --text: #e5edf8;
  --muted: #a7b4c8;
  --line: #334155;
  --line-soft: #263449;
  --primary: #60a5fa;
  --primary-hover: #93c5fd;
  --primary-soft: #172554;
  --focus: #93c5fd;
  --success: #6ee7b7;
  --hero-start: #020617;
  --hero-end: #172554;
  --hero-text: #f8fafc;
  --hero-muted: #cbd5e1;
  --hero-accent: #bfdbfe;
  --shadow: 0 1px 3px rgba(0,0,0,.4);
  --hero-shadow: 0 22px 52px rgba(0,0,0,.45);
  --profile-bg: rgba(15,23,42,.62);
  --profile-border: rgba(147,197,253,.3);
  --profile-text: #f8fafc;
  --profile-muted: #bfdbfe;
  color-scheme: dark;
}

.app-nav {
  display: grid; grid-template-columns: minmax(190px,1fr) auto minmax(260px,1fr); align-items: center;
  gap: 24px; min-height: 72px; padding: 0 5vw; border-bottom: 1px solid var(--line);
  background: color-mix(in srgb,var(--surface) 96%,transparent); box-shadow: var(--shadow);
}
.brand { display: inline-flex; align-items: center; gap: 10px; width: fit-content; color: var(--text); text-decoration: none; }
.brand-mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; color: white;
  background: linear-gradient(135deg,#1d4ed8,#4f46e5); font-weight: 900; box-shadow: 0 8px 18px rgba(37,99,235,.25); }
.brand strong, .brand small { display: block; line-height: 1.2; }
.brand small { margin-top: 3px; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.nav-links { display: flex; align-items: center; gap: 6px; }
.nav-links a { padding: 8px 11px; border-radius: 7px; color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 700; }
.nav-links a.active, .nav-links a:hover { color: var(--primary); background: var(--primary-soft); }
.nav-slot { justify-self: end; }
.nav-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.nav-action, .dashboard-hero button, .task-card button {
  min-height: 40px; padding: 9px 14px; border: 0; border-radius: 8px; color: white; background: #1d4ed8; font-weight: 800;
}
.theme-toggle { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 8px 11px;
  border: 1px solid var(--line); border-radius: 8px; color: var(--text); background: var(--surface); font-weight: 800; }
.theme-toggle:hover { background: var(--surface-hover); }
.theme-icon { position: relative; width: 16px; height: 16px; border: 2px solid currentcolor; border-radius: 50%; }
.theme-icon[data-mode="dark"] { border-radius: 50%; background: currentcolor; box-shadow: inset 5px -3px 0 var(--surface); }

.dashboard-shell { width: min(1180px,calc(100% - 32px)); margin: 0 auto; padding: 26px 0 40px; }
.dashboard-hero { display: flex; align-items: center; justify-content: space-between; gap: 30px; padding: clamp(24px,5vw,42px);
  border-radius: 18px; color: var(--hero-text); background: linear-gradient(135deg,var(--hero-start),var(--hero-end)); box-shadow: var(--hero-shadow); }
.dashboard-hero h1 { max-width: 15ch; margin: 5px 0 10px; font-size: clamp(30px,5vw,48px); line-height: 1.02; letter-spacing: -.035em; }
.dashboard-hero p { max-width: 620px; margin: 0; color: var(--hero-muted); line-height: 1.65; }
.dashboard-hero [data-acl-slot="announcement"] { color: var(--hero-accent); font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
.overline { color: var(--primary); font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 22px; }
#sample-status { color: var(--hero-accent); font-size: 13px; font-weight: 700; }

.stat-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px; margin: 18px 0; }
.stat-card { position: relative; overflow: hidden; min-height: 145px; padding: 18px; border: 1px solid var(--line);
  border-radius: 13px; background: var(--surface); box-shadow: var(--shadow); }
.stat-card::after { position: absolute; top: 0; right: 0; width: 70px; height: 70px; border-radius: 0 0 0 70px; background: #dbeafe; content: ""; opacity: .9; }
.demo-app[data-theme="dark"] .stat-card::after { opacity: .25; }
.stat-card[data-tone="green"]::after { background: #4ade80; }
.stat-card[data-tone="violet"]::after { background: #a78bfa; }
.stat-card[data-tone="amber"]::after { background: #fbbf24; }
.stat-label, .stat-value, .stat-trend { position: relative; z-index: 1; display: block; }
.stat-label { color: var(--muted); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
.stat-value { margin: 12px 0 5px; color: var(--text); font-size: 30px; line-height: 1; }
.stat-trend { color: var(--success); font-size: 12px; font-weight: 800; }

.dashboard-grid { display: grid; grid-template-columns: minmax(0,1.65fr) minmax(280px,.8fr); gap: 18px; }
.dashboard-panel, .task-card, .activity-card { padding: 22px; border: 1px solid var(--line); border-radius: 14px;
  background: var(--surface); box-shadow: var(--shadow); }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.panel-heading h2, .task-card h2 { margin: 3px 0 0; font-size: 19px; }
.quiet-button { padding: 7px 10px; border: 1px solid var(--line); border-radius: 7px; color: var(--text);
  background: var(--surface); font-weight: 800; }
.quiet-button:hover { background: var(--surface-hover); }
.project-list { display: grid; gap: 10px; }
.project-card { display: grid; grid-template-columns: minmax(0,1fr) minmax(120px,.45fr) auto; align-items: center; gap: 18px;
  padding: 14px; border: 1px solid var(--line-soft); border-radius: 10px; background: var(--surface-soft); }
.project-copy { display: flex; align-items: center; gap: 12px; min-width: 0; }
.project-icon { width: 38px; height: 38px; flex: 0 0 auto; border-radius: 10px; background: linear-gradient(135deg,#dbeafe,#c7d2fe); }
.project-card h3 { overflow: hidden; margin: 0; color: var(--text); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.project-card p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
.progress-row { display: flex; align-items: center; gap: 8px; }
.progress-track { height: 6px; flex: 1; overflow: hidden; border-radius: 999px; background: var(--line-soft); }
.progress-track span, .task-progress span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#2563eb,#818cf8); }
.progress-row strong { color: var(--muted); font-size: 11px; }
.watch-button { min-width: 74px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 7px;
  color: var(--text); background: var(--surface); font-weight: 800; }
.watch-button:hover { background: var(--surface-hover); }

.dashboard-rail { display: grid; align-content: start; gap: 18px; }
.task-card p { color: var(--muted); }
.task-progress { height: 8px; margin: 15px 0; overflow: hidden; border-radius: 999px; background: var(--line-soft); }
.task-card button:disabled { cursor: default; opacity: .5; }
.activity-list { display: grid; gap: 14px; }
.activity-item { display: flex; align-items: flex-start; gap: 10px; }
.activity-avatar { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 auto; border-radius: 50%;
  color: #1e3a8a; background: #dbeafe; font-size: 10px; font-weight: 900; }
.activity-avatar[data-tone="violet"] { color: #5b21b6; background: #ede9fe; }
.activity-avatar[data-tone="green"] { color: #166534; background: #dcfce7; }
.activity-item p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.activity-item strong, .activity-item small { display: block; }
.activity-item strong { color: var(--text); }
.activity-item small { margin-top: 2px; color: var(--muted); }
.live-badge { padding: 4px 7px; border-radius: 999px; color: #166534; background: #dcfce7; font-size: 10px; font-weight: 900; text-transform: uppercase; }
.dashboard-footer { display: flex; justify-content: space-between; gap: 20px; padding: 18px 5vw; border-top: 1px solid var(--line);
  color: var(--muted); background: var(--surface); font-size: 12px; font-weight: 700; }

@media (max-width: 900px) {
  .app-nav { grid-template-columns: 1fr auto; }
  .nav-links { display: none; }
  .stat-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .dashboard-grid { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .nav-action { display: none; }
  .dashboard-hero { align-items: flex-start; flex-direction: column; }
  .stat-grid { grid-template-columns: 1fr; }
  .project-card { grid-template-columns: 1fr; }
  .dashboard-footer { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) {
  .demo-app { transition: none; }
}`,
    javascript: String.raw`const existingTheme = Alpine.store('theme');
if (!existingTheme) {
  Alpine.store('theme', { mode: 'light' });
}

const existingDashboard = Alpine.store('dashboard');
if (!existingDashboard) {
  Alpine.store('dashboard', {
    status: 'All systems are healthy.',
    reportsCreated: 0,
    metrics: [
      { label: 'Active projects', value: '12', trend: '+3 this month', tone: 'blue' },
      { label: 'Tasks completed', value: '84%', trend: '+8% this week', tone: 'green' },
      { label: 'Team capacity', value: '72%', trend: 'Healthy workload', tone: 'violet' },
      { label: 'Open decisions', value: '6', trend: '2 need review', tone: 'amber' }
    ],
    projects: [
      { title: 'Customer onboarding', owner: 'Growth team', progress: 76, status: 'On track' },
      { title: 'Mobile release', owner: 'Product studio', progress: 58, status: 'Reviewing' },
      { title: 'Q3 planning', owner: 'Operations', progress: 34, status: 'In progress' },
      { title: 'Support migration', owner: 'Customer success', progress: 21, status: 'Planning' }
    ],
    activities: [
      { person: 'Alex Kim', action: 'approved the onboarding flow.', time: '12 minutes ago', initials: 'AK', tone: 'blue' },
      { person: 'Rina Patel', action: 'moved Mobile release to review.', time: '48 minutes ago', initials: 'RP', tone: 'violet' },
      { person: 'Jordan Lee', action: 'completed the weekly report.', time: '2 hours ago', initials: 'JL', tone: 'green' }
    ]
  });
}

Object.assign(Alpine.store('dashboard'), {
  createReport() {
    this.reportsCreated += 1;
    this.status = 'Weekly report ' + this.reportsCreated + ' created locally.';
  },
  invite() {
    this.status = 'Invitation draft opened for the Operations workspace.';
  },
  handleProjectToggle(event) {
    this.status = event.detail.watching
      ? 'Watching ' + event.detail.title + '.'
      : 'Stopped watching ' + event.detail.title + '.';
  },
  handleTaskProgress(event) {
    this.status = event.detail.complete + ' of ' + event.detail.total + ' priority tasks complete.';
  },
  announceTheme(mode) {
    this.status = (mode === 'dark' ? 'Dark' : 'Light') + ' theme enabled.';
  }
});

AlpineComponentLoader.config({
  observability: {
    bufferSize: 50,
    performanceMarks: true
  }
});

if (!AlpineComponentLoader.has('demo-profile-card')) {
  await AlpineComponentLoader.define('demo-profile-card', '#demo-profile-template', {
    shadow: true,
    attributes: {
      name: String,
      job: String,
      initials: String
    }
  });
}

playgroundHot.dispose(() => {
  console.info('Northstar dashboard module disposed');
});

await AlpineComponentLoader.start();
console.info('Northstar ACL dashboard ready', AlpineComponentLoader.getRegisteredTags());`,
};

export default DEFAULT_SOURCES;
