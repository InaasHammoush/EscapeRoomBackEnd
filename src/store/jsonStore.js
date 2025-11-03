// Ein ultraleichter Key-Value-Store im Speicher, der (optional) auf Disk persistiert.
// Nutzt atomare Writes: writeFile -> rename, damit keine korrupten Dateien entstehen.
import { promises as fs } from 'fs';
import path from 'path';

export class JsonStore {
  constructor({ file = './data/runtime.json', autosaveMs = 2000 } = {}) {
    this.file = file;
    this.dir = path.dirname(file);
    this.data = {};          // In-Memory JSON
    this.timer = null;
    this.autosaveMs = autosaveMs;
  }

  async load() {
    try {
      await fs.mkdir(this.dir, { recursive: true });
      const raw = await fs.readFile(this.file, 'utf8');
      this.data = JSON.parse(raw || '{}');
    } catch {
      this.data = {};
    }
  }

  get(key, def = null) {
    return key in this.data ? this.data[key] : def;
  }

  set(key, value) {
    this.data[key] = value;
    this.scheduleSave();
  }

  delete(key) {
    delete this.data[key];
    this.scheduleSave();
  }

  all() { return { ...this.data }; }

  entriesWithPrefix(prefix) {
    return Object.entries(this.data).filter(([k]) => k.startsWith(prefix));
  }

  scheduleSave() {
    if (!this.autosaveMs) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save().catch(()=>{}), this.autosaveMs);
  }

  async save() {
    const tmp = this.file + '.tmp';
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(this.data), 'utf8');
    await fs.rename(tmp, this.file);
  }
}
