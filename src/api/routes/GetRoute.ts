import { Client } from "../../structures/Client.js";
import Route from "../../structures/Route.js";

export default class GetRoute extends Route{

    public constructor(public client: Client) {
        super();
        this.setRoutes();
    }

    protected setRoutes(): void {
    }
}