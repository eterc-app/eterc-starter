import { sqliteTable, AnySQLiteColumn, integer, text, index, uniqueIndex, numeric, foreignKey, real } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const etercUserLevels = sqliteTable("eterc_user_levels", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	levelTitle: text("level_title").default(""),
});

export const etercUsers = sqliteTable("eterc_users", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	code: text(),
	userLevelId: integer("user_level_id").default(0).notNull(),
});

export const etercAdministrators = sqliteTable("eterc_administrators", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	username: text(),
	email: text(),
	password: text(),
	etercUserId: integer("eterc_user_id"),
	active: integer().default(0).notNull(),
	failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
	lastFailedAttempt: integer("last_failed_attempt").default(0).notNull(),
	loginBlockedUntil: integer("login_blocked_until").default(0).notNull(),
	failedLoginIp: text("failed_login_ip").default("").notNull(),
	firstName: text("first_name").default("").notNull(),
	lastName: text("last_name").default("").notNull(),
	title: text().default("").notNull(),
});

export const etercTokens = sqliteTable("eterc_tokens", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	token: text(),
	userId: integer("user_id").default(0).notNull(),
	expiryDate: integer("expiry_date"),
	code: text().default("0"),
},
(table) => [
	index("eterc_tokens_token_idx").on(table.token),
]);

export const loginAttempts = sqliteTable("login_attempts", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	targetTable: text("target_table").notNull(),
	identifier: text().notNull(),
	ipAddress: text("ip_address").default("").notNull(),
	attemptedAt: integer("attempted_at").notNull(),
},
(table) => [
	index("login_attempts_identifier_idx").on(table.identifier),
	index("login_attempts_target_table_idx").on(table.targetTable),
]);

export const passwordResets = sqliteTable("password_resets", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	targetTable: text("target_table").notNull(),
	identifier: text().notNull(),
	token: text().notNull(),
	expiryDate: integer("expiry_date").notNull(),
	used: integer().default(0).notNull(),
	createdAt: integer("created_at").notNull(),
},
(table) => [
	index("password_resets_token_idx").on(table.token),
]);

export const etSessions = sqliteTable("et_sessions", {
	id: text().primaryKey(),
	data: text().default("{}").notNull(),
	expires: integer().notNull(),
});

export const cmsCollections = sqliteTable("cms_collections", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	name: text().notNull(),
	label: text().default("").notNull(),
	icon: text().default("table").notNull(),
	note: text().default("").notNull(),
	primaryKey: text("primary_key").default("id").notNull(),
	singleton: integer().default(0).notNull(),
	hidden: integer().default(0).notNull(),
	system: integer().default(0).notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	color: text().default("").notNull(),
	displayTemplate: text("display_template").default("").notNull(),
	orderingMode: text("ordering_mode").default("").notNull(),
	defaultOrder: text("default_order").default("[]").notNull(),
});

export const cmsFields = sqliteTable("cms_fields", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	collectionId: integer("collection_id").notNull(),
	name: text().notNull(),
	label: text().default("").notNull(),
	type: text().default("string").notNull(),
	interface: text().default("input").notNull(),
	options: text().default("{}").notNull(),
	required: integer().default(0).notNull(),
	unique: integer().default(0).notNull(),
	hidden: integer().default(0).notNull(),
	readonly: integer().default(0).notNull(),
	sort: integer().default(0).notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	group: text(),
	validation: text().default("{\"match\":\"all\",\"conditions\":[]}").notNull(),
	validationMessage: text("validation_message").default("").notNull(),
	conditions: text().default("[]").notNull(),
	displayOptions: text("display_options").default("{}").notNull(),
	clearHiddenValueOnSave: integer("clear_hidden_value_on_save").default(0).notNull(),
},
(table) => [
	index("cms_fields_collection_idx").on(table.collectionId),
]);

export const etercRoles = sqliteTable("eterc_roles", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userLevelId: integer("user_level_id").notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text().default("").notNull(),
	appAccess: integer("app_access").default(1).notNull(),
	apiAccess: integer("api_access").default(1).notNull(),
	adminAccess: integer("admin_access").default(0).notNull(),
	isSystem: integer("is_system").default(0).notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	parentRoleId: integer("parent_role_id"),
},
(table) => [
	index("eterc_roles_parent_idx").on(table.parentRoleId),
]);

export const etercPermissions = sqliteTable("eterc_permissions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	roleId: integer("role_id").notNull(),
	collection: text().notNull(),
	action: text().notNull(),
	fields: text().default("[]").notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	filter: text().default("{\"match\":\"all\",\"conditions\":[]}").notNull(),
	validation: text().default("{\"match\":\"all\",\"conditions\":[]}").notNull(),
	presets: text().default("[]").notNull(),
},
(table) => [
	index("eterc_permissions_role_idx").on(table.roleId),
]);

export const etercApiKeys = sqliteTable("eterc_api_keys", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	name: text().notNull(),
	keyPrefix: text("key_prefix").notNull(),
	keyHash: text("key_hash").notNull(),
	roleId: integer("role_id").notNull(),
	userId: integer("user_id"),
	active: integer().default(1).notNull(),
	expiresAt: integer("expires_at"),
	lastUsedAt: integer("last_used_at"),
	createdAt: integer("created_at").notNull(),
},
(table) => [
	index("eterc_api_keys_prefix_idx").on(table.keyPrefix),
]);

export const etercIdentities = sqliteTable("eterc_identities", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: integer("user_id").notNull(),
	provider: text().notNull(),
	subject: text().notNull(),
	email: text().default("").notNull(),
	name: text().default("").notNull(),
	createdAt: integer("created_at").notNull(),
},
(table) => [
	index("eterc_identities_user_idx").on(table.userId),
]);

export const cmsMigrations = sqliteTable("cms_migrations", {
	id: text().primaryKey().notNull(),
	appliedAt: integer("applied_at").notNull(),
});

export const posts = sqliteTable("posts", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	title: text().default("").notNull(),
	slug: text(),
	excerpt: text(),
	body: text(),
	status: text(),
	publishedAt: text("published_at"),
	coverImage: text("cover_image"),
	featured: integer().default(0).notNull(),
	createdAt: text("created_at").default("sql`(datetime('now'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now'))`").notNull(),
},
(table) => [
	uniqueIndex("cms_uq_posts_slug").on(table.slug),
]);

export const product1 = sqliteTable("product1", {
	id: integer().primaryKey({ autoIncrement: true }),
	title: text().notNull(),
	status: text().default("draft").notNull(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	a: text(),
	b: text(),
	c: text(),
});

export const animalsnew = sqliteTable("animalsnew", {
	id: integer().primaryKey({ autoIncrement: true }),
	title: text().notNull(),
	status: text().default("draft").notNull(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const hhh = sqliteTable("hhh", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	status: text().default("draft").notNull(),
	dateCreated: text("date_created").default("sql`(datetime('now'))`").notNull(),
	dateUpdated: text("date_updated").default("sql`(datetime('now'))`").notNull(),
});

export const gggghhhh = sqliteTable("gggghhhh", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	status: text().default("draft").notNull(),
	dateCreated: text("date_created").default("sql`(datetime('now'))`").notNull(),
	dateUpdated: text("date_updated").default("sql`(datetime('now'))`").notNull(),
});

export const dddd = sqliteTable("dddd", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	status: text().default("draft").notNull(),
	dateCreated: text("date_created").default("sql`(datetime('now'))`").notNull(),
	dateUpdated: text("date_updated").default("sql`(datetime('now'))`").notNull(),
});

export const ggeeedddd = sqliteTable("ggeeedddd", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	status: text().default("draft").notNull(),
	sort: integer(),
	dateCreated: text("date_created").default("sql`(datetime('now'))`").notNull(),
	userCreated: text("user_created"),
	dateUpdated: text("date_updated").default("sql`(datetime('now'))`").notNull(),
	userUpdated: text("user_updated"),
	autocomplete: text(),
	blockeditor: text(),
	code: text(),
	textarea: text(),
	wysiwyg: text(),
	markdown: text(),
	toggle: integer().default(0).notNull(),
	datetime: text(),
	date: text(),
	repeater: text(),
	map: text(),
	color: text(),
	dropdown: text(),
	icon: text(),
	checkbox: text(),
	checkboxtree: text(),
	dropdownmultilevel: text(),
	radiobutton: text(),
	file: text(),
	image: text(),
	translation: text(),
	slider: integer(),
	hash: text(),
	hashwithmusk: text(),
	collectionitem2: text(),
	collectionitem1: text(),
	tags: text(),
},
(table) => [
	index("cms_sort_ggeeedddd_sort").on(table.sort),
]);

export const cmsFlows = sqliteTable("cms_flows", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	description: text().default("").notNull(),
	icon: text().default("zap").notNull(),
	color: text().default("#6366f1").notNull(),
	status: text().default("inactive").notNull(),
	trigger: text().default("manual").notNull(),
	options: text().default("{}").notNull(),
	accountability: text(),
	operation: text(),
	revision: integer().default(1).notNull(),
	secretHash: text("secret_hash"),
	secretPrefix: text("secret_prefix"),
	nextRunAt: integer("next_run_at"),
	lastRunAt: integer("last_run_at"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
},
(table) => [
	index("cms_flows_next_run_idx").on(table.status, table.nextRunAt),
	index("cms_flows_status_trigger_idx").on(table.status, table.trigger),
]);

export const cmsFlowOperations = sqliteTable("cms_flow_operations", {
	id: text().primaryKey().notNull(),
	flowId: text("flow_id").notNull().references(() => cmsFlows.id, { onDelete: "cascade" } ),
	name: text().notNull(),
	key: text().notNull(),
	type: text().notNull(),
	options: text().default("{}").notNull(),
	positionX: real("position_x").notNull(),
	positionY: real("position_y").notNull(),
	resolve: text(),
	reject: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
},
(table) => [
	index("cms_flow_operations_flow_idx").on(table.flowId),
]);

export const cmsFlowRuns = sqliteTable("cms_flow_runs", {
	id: text().primaryKey().notNull(),
	flowId: text("flow_id").notNull().references(() => cmsFlows.id, { onDelete: "cascade" } ),
	trigger: text().notNull(),
	status: text().default("running").notNull(),
	startedAt: integer("started_at").notNull(),
	finishedAt: integer("finished_at"),
	durationMs: integer("duration_ms"),
	input: text().default("null").notNull(),
	output: text().default("null").notNull(),
	error: text(),
	principal: text().default("{}").notNull(),
	accountability: text(),
	parentRunId: text("parent_run_id"),
	createdAt: integer("created_at").notNull(),
},
(table) => [
	index("cms_flow_runs_status_idx").on(table.status),
	index("cms_flow_runs_flow_started_idx").on(table.flowId, table.startedAt),
]);

export const cmsFlowRunSteps = sqliteTable("cms_flow_run_steps", {
	id: text().primaryKey().notNull(),
	runId: text("run_id").notNull().references(() => cmsFlowRuns.id, { onDelete: "cascade" } ),
	operationId: text("operation_id"),
	key: text().default("").notNull(),
	type: text().default("").notNull(),
	path: text().default("root").notNull(),
	status: text().default("success").notNull(),
	startedAt: integer("started_at").notNull(),
	finishedAt: integer("finished_at").notNull(),
	durationMs: integer("duration_ms").default(0).notNull(),
	input: text().default("null").notNull(),
	output: text().default("null").notNull(),
	error: text(),
	sort: integer().default(0).notNull(),
},
(table) => [
	index("cms_flow_run_steps_run_idx").on(table.runId, table.sort),
]);

export const cmsFlowJobs = sqliteTable("cms_flow_jobs", {
	id: text().primaryKey().notNull(),
	flowId: text("flow_id").notNull().references(() => cmsFlows.id, { onDelete: "cascade" } ),
	trigger: text().notNull(),
	payload: text().default("{}").notNull(),
	status: text().default("pending").notNull(),
	attempts: integer().default(0).notNull(),
	maxAttempts: integer("max_attempts").default(3).notNull(),
	runAt: integer("run_at").notNull(),
	lockedAt: integer("locked_at"),
	lockedBy: text("locked_by"),
	error: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
},
(table) => [
	index("cms_flow_jobs_claim_idx").on(table.status, table.runAt),
]);

