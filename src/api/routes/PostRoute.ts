import { Client } from "../../structures/Client.js";
import Route from "../../structures/Route.js";
import ChangeLogController from "../controllers/ChangeLogController.js";

export default class PostRoute extends Route {
    private changeLog = new ChangeLogController(this.client);

    public constructor(public client: Client) {
        super();
        this.setRoutes();
    }

    protected setRoutes(): void {
        this.router.post('/api/dev/changelog', (...args) => this.changeLog.execute(...args));
    }
}