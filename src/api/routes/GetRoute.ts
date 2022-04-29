import { Client } from "../../structures/Client";
import Route from "../../structures/Route";

export default class GetRoute extends Route{

    public constructor(public client: Client) {
        super();
        this.setRoutes();
    }

    protected setRoutes(): void {
    }
}