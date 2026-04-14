import { END, START, StateGraph } from "@langchain/langgraph";
import { AgentState } from "./state.js";
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

export const buildAgentGraph = () =>
  new StateGraph(AgentState)
    .addNode("initialize", initializeNode)
    .addNode("scope", scopeNode)
    .addNode("planning", planNode)
    .addNode("searching", searchNode)
    .addNode("fetching", fetchNode)
    .addNode("extracting", extractNode)
    .addNode("ranking", rankNode)
    .addNode("imaging", imageNode)
    .addNode("reporting", reportNode)
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
