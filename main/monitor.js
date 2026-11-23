// Aguarda o fim das cópias e verifica periodicamente mudanças perdidas pelo Windows.
class SkillMonitor {
  constructor(store, notify, delay = 3000, poll = 15000) { this.store = store; this.notify = notify; this.delay = delay; this.poll = poll; this.timer = null; this.interval = null; }
  check() { const skills = this.store.scan(); this.notify(skills, this.store.takeNotices()); }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.check(), this.delay); }
  start() { this.store.watch(() => this.schedule()); this.interval = setInterval(() => this.check(), this.poll); }
  stop() { clearTimeout(this.timer); clearInterval(this.interval); this.store.watcher?.close(); }
}
module.exports = { SkillMonitor };
