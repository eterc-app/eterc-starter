import { Eterc } from "@/engine/controller";
export default class Welcome extends Eterc {
  async index() {
    const data = {
      viewModule: "welcome",
      viewFile: "default_homepage",
    };

    return this.templates.public(data);
  }
}
