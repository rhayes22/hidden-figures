import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  bills,
  chamberEnum,
  legislators,
  rollCalls,
  syncRuns,
  votePositionEnum,
  votePositions,
} from "./schema";

describe("schema", () => {
  it("has the four MVP tables with their snake_case names", () => {
    expect(getTableConfig(legislators).name).toBe("legislators");
    expect(getTableConfig(bills).name).toBe("bills");
    expect(getTableConfig(rollCalls).name).toBe("roll_calls");
    expect(getTableConfig(votePositions).name).toBe("vote_positions");
  });

  it("records ingest runs in sync_runs", () => {
    expect(getTableConfig(syncRuns).name).toBe("sync_runs");
  });

  it("requires every sync_runs row to say which script ran, when, and how it exited", () => {
    const columns = getTableConfig(syncRuns).columns;
    for (const name of ["script", "started_at", "finished_at", "exit_code"]) {
      const column = columns.find((c) => c.name === name);
      expect(column, name).toBeDefined();
      expect(column?.notNull, name).toBe(true);
    }
  });

  it("indexes sync_runs on (script, finished_at) — the reader's only query", () => {
    const { indexes } = getTableConfig(syncRuns);
    expect(indexes).toHaveLength(1);
    expect(indexes[0].config.columns.map((c) => "name" in c && c.name)).toEqual([
      "script",
      "finished_at",
    ]);
  });

  it("covers every position a member can take on a roll call", () => {
    expect(votePositionEnum.enumValues).toEqual([
      "yea",
      "nay",
      "present",
      "not_voting",
    ]);
  });

  it("covers both chambers", () => {
    expect(chamberEnum.enumValues).toEqual(["house", "senate"]);
  });

  it("prevents duplicate positions via composite primary key", () => {
    const { primaryKeys } = getTableConfig(votePositions);
    expect(primaryKeys).toHaveLength(1);
    expect(primaryKeys[0].columns.map((c) => c.name).sort()).toEqual([
      "legislator_id",
      "roll_call_id",
    ]);
  });

  it("allows roll calls without a bill (procedural votes, nominations)", () => {
    const billId = getTableConfig(rollCalls).columns.find(
      (c) => c.name === "bill_id",
    );
    expect(billId?.notNull).toBe(false);
  });

  it("allows roll calls without published description or result text", () => {
    const columns = getTableConfig(rollCalls).columns;
    const description = columns.find((c) => c.name === "description");
    const resultText = columns.find((c) => c.name === "result_text");
    expect(description).toBeDefined();
    expect(description?.notNull).toBe(false);
    expect(resultText).toBeDefined();
    expect(resultText?.notNull).toBe(false);
  });

  it("allows roll calls without a published tally", () => {
    const columns = getTableConfig(rollCalls).columns;
    for (const name of [
      "published_yea",
      "published_nay",
      "published_present",
      "published_not_voting",
    ]) {
      const column = columns.find((c) => c.name === name);
      expect(column, name).toBeDefined();
      expect(column?.notNull, name).toBe(false);
    }
  });
});
