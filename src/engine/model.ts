import { Db, db as sharedDb } from "./db";
export class Model {
  readonly moduleName: string | null;
  private _db: Db | null = null;

  constructor(moduleName: string | null = null) {
    this.moduleName = moduleName;
  }

  get db(): Db {
    if (!this._db) {
      this._db = this.moduleName ? new Db(this.moduleName) : sharedDb;
    }
    return this._db;
  }
}
