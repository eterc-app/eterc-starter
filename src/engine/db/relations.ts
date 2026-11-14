import { relations } from "drizzle-orm/relations";
import { cmsFlows, cmsFlowOperations, cmsFlowRuns, cmsFlowRunSteps, cmsFlowJobs } from "./schema";

export const cmsFlowOperationsRelations = relations(cmsFlowOperations, ({one}) => ({
	cmsFlow: one(cmsFlows, {
		fields: [cmsFlowOperations.flowId],
		references: [cmsFlows.id]
	}),
}));

export const cmsFlowsRelations = relations(cmsFlows, ({many}) => ({
	cmsFlowOperations: many(cmsFlowOperations),
	cmsFlowRuns: many(cmsFlowRuns),
	cmsFlowJobs: many(cmsFlowJobs),
}));

export const cmsFlowRunsRelations = relations(cmsFlowRuns, ({one, many}) => ({
	cmsFlow: one(cmsFlows, {
		fields: [cmsFlowRuns.flowId],
		references: [cmsFlows.id]
	}),
	cmsFlowRunSteps: many(cmsFlowRunSteps),
}));

export const cmsFlowRunStepsRelations = relations(cmsFlowRunSteps, ({one}) => ({
	cmsFlowRun: one(cmsFlowRuns, {
		fields: [cmsFlowRunSteps.runId],
		references: [cmsFlowRuns.id]
	}),
}));

export const cmsFlowJobsRelations = relations(cmsFlowJobs, ({one}) => ({
	cmsFlow: one(cmsFlows, {
		fields: [cmsFlowJobs.flowId],
		references: [cmsFlows.id]
	}),
}));