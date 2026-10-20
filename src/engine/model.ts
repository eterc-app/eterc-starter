import { Db, db as sharedDb } from "./db";

/**
 * Model base class — port of engine/Model.php.
 *
 * Module models extend this class (e.g. `class Login_model extends Model`) and
 * reach the database through `this.db` — exactly like the PHP original.
 */
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
