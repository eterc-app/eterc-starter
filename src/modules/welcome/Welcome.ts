import { Eterc } from "@/engine/controller";

/**
 * Welcome module — port of modules/welcome/Welcome.php
 * (the default homepage entry point).
 */
export default class Welcome extends Eterc {
  async index() {
    const data = {
      viewModule: "welcome",
      viewFile: "default_homepage",
    };

    return this.templates.public(data);
  }
}
