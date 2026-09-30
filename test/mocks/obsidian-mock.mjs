export class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest;
    this.registeredIntervals = [];
  }

  registerInterval(id) {
    this.registeredIntervals.push(id);
    return id;
  }

  onload() {}

  onunload() {
    for (const id of this.registeredIntervals) {
      clearInterval(id);
    }
    this.registeredIntervals = [];
  }
}
