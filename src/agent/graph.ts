import { END, START, StateGraph } from "@langchain/langgraph";
import { AgentState, type AgentStateType } from "./state.js";
import {
  extractNode,
  fetchNode,
  imageNode,
  initializeNode,
  planNode,
  rankNode,
  reportNode,
  routeAfterScope,
  scopeNode,
  searchNode,
} from "./nodes.js";
import { logError, logInfo } from "../utils/log.js";

const withNodeLogging = <T>(name: string, fn: (state: AgentStateType) => Promise<T> | T) =>
  async (state: AgentStateType): Promise<T> => {
    logInfo(`graph:${name}`, "Node start", {
      runId: state.runId || undefined,
      query: state.input.query || undefined,
    });
    try {
      const result = await fn(state);
      logInfo(`graph:${name}`, "Node complete");
      return result;
    } catch (error) {
      logError(`graph:${name}`, "Node failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

export const buildAgentGraph = () =>
  new StateGraph(AgentState)
    .addNode("initialize", withNodeLogging("initialize", initializeNode))
    .addNode("scope", withNodeLogging("scope", scopeNode))
    .addNode("planning", withNodeLogging("planning", planNode))
    .addNode("searching", withNodeLogging("searching", searchNode))
    .addNode("fetching", withNodeLogging("fetching", fetchNode))
    .addNode("extracting", withNodeLogging("extracting", extractNode))
    .addNode("ranking", withNodeLogging("ranking", rankNode))
    .addNode("imaging", withNodeLogging("imaging", imageNode))
    .addNode("reporting", withNodeLogging("reporting", reportNode))
    .addEdge(START, "initialize")
    .addEdge("initialize", "scope")
    .addConditionalEdges("scope", routeAfterScope, {
      report: "reporting",
      plan: "planning",
    })
    .addEdge("planning", "searching")
    .addEdge("searching", "fetching")
    .addEdge("fetching", "extracting")
    .addEdge("extracting", "ranking")
    .addEdge("ranking", "imaging")
    .addEdge("imaging", "reporting")
    .addEdge("reporting", END)
    .compile();
