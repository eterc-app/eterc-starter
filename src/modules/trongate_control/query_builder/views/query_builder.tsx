"use client";

import type { ClipboardEvent, DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TgViewProps } from "@/engine/views-registry";
import type { QueryBuilderTable } from "../Query_builder";

/**
 * Query builder — port of the standalone page served by
 * modules/trongate_control/query_builder.
 *
 * PHP originals:
 *   views/query_builder.php  — page shell + loading spinner + JPEG preloads
 *   js/query_builder.js      — the whole builder (drag & drop, join drawing,
 *                              SQL generation) — ported below, function by
 *                              function, with the original comment structure
 *   css/query_builder.css    — /trongate_control-query_builder_module/css/
 *   css/table-joins.css      — (join-type menu backgrounds)
 *   fonts/VT323-Regular.ttf  — page font
 *   images/joins/{active,dark}/joinN.png — join type menu images
 *
 * The original was embedded in a Flo iframe and talked to its parent with
 * `window.parent.postMessage(...)`; that protocol is preserved here (it is a
 * no-op when the page is opened directly).
 */

const nl = "\n";
const ind = "    ";

const joinTypes = [
  "left outer join",
  "right outer join",
  "right excluding join",
  "outer excluding join",
  "full join",
  "left excluding join",
  "inner join",
];

const joinMenuOptions = [
  "LEFT OUTER JOIN",
  "RIGHT OUTER JOIN",
  "RIGHT EXCLUDING JOIN",
  "OUTER EXCLUDING JOIN",
  "FULL JOIN",
  "LEFT EXCLUDING JOIN",
  "INNER JOIN",
];

const SELECT_ALL_PREFIX = "select-all-from-";

interface SelectedJoin {
  tableAName: string;
  tableAColumn: string;
  tableBName: string;
  tableBColumn: string;
  joinType: string;
}

function emptyJoin(): SelectedJoin {
  return {
    tableAName: "",
    tableAColumn: "",
    tableBName: "",
    tableBColumn: "",
    joinType: "",
  };
}

interface TablePosition {
  x: number;
  y: number;
}

export default function QueryBuilder({ data }: TgViewProps): ReactNode {
  const tables = useMemo(
    () => (data.tables ?? []) as QueryBuilderTable[],
    [data.tables]
  );

  const [ready, setReady] = useState(false);
  const [droppedTables, setDroppedTables] = useState<string[]>([]);
  const [positions, setPositions] = useState<Record<string, TablePosition>>({});
  const [selectedJoins, setSelectedJoins] = useState<SelectedJoin[]>([]);
  const [pendingJoin, setPendingJoin] = useState<SelectedJoin>(emptyJoin);
  const [showingJoinSelector, setShowingJoinSelector] = useState(false);
  const [checkedAll, setCheckedAll] = useState<string[]>([]);
  const [checkedColumns, setCheckedColumns] = useState<string[]>([]);
  const [showSql, setShowSql] = useState(false);
  const [sqlText, setSqlText] = useState("");
  const [copyBtnLabel, setCopyBtnLabel] = useState("Copy SQL");
  const [selectableTables, setSelectableTables] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const centerStageRef = useRef<HTMLDivElement | null>(null);
  const tableStackRef = useRef<HTMLDivElement | null>(null);
  const tableEls = useRef(new Map<string, HTMLTableElement | null>());
  const dragSourceRef = useRef<string | null>(null);

  // Drawing state (mirrors the original's globals).
  const isDrawing = useRef(false);
  const joinStart = useRef({ x: 0, y: 0 });
  const joinEnd = useRef({ x: 0, y: 0 });

  const tableById = useCallback(
    (tableId: string): QueryBuilderTable | undefined =>
      tables.find((table) => table.id === tableId),
    [tables]
  );

  const columnKey = (tableId: string, columnName: string) =>
    `${tableId}~${columnName}`;

  /* ─── Canvas helpers ──────────────────────────────────────── */

  const context = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    return canvas ? canvas.getContext("2d") : null;
  }, []);

  const clearCanvas = useCallback(() => {
    const ctx = context();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [context]);

  /** Original: drawLine() — draws from joinStart to joinEnd. */
  const drawLine = useCallback(() => {
    const ctx = context();
    if (!ctx) return;

    ctx.beginPath();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.moveTo(joinStart.current.x, joinStart.current.y);
    ctx.lineTo(joinEnd.current.x, joinEnd.current.y);
    ctx.stroke();
    ctx.closePath();
  }, [context]);

  /** Original: getColumnFromTableCell(cellContents). */
  const getColumnFromTableCell = useCallback((cell: HTMLTableCellElement): string => {
    return (cell.textContent ?? "").trim();
  }, []);

  /** Original: calcLeftmostTable(tableAName, tableBName). */
  const calcLeftmostTable = useCallback((tableAName: string, tableBName: string) => {
    const tableA = tableEls.current.get(tableAName);
    const tableB = tableEls.current.get(tableBName);
    if (!tableA || !tableB) return tableAName;

    const tableALeft = tableA.getBoundingClientRect().left;
    const tableBLeft = tableB.getBoundingClientRect().left;

    return tableALeft < tableBLeft ? tableAName : tableBName;
  }, []);

  /** Original: setJoinStartPosition(tableName, columnName, joinSide). */
  const setJoinStartPosition = useCallback(
    (tableName: string, columnName: string, joinSide: "left" | "right") => {
      const canvas = canvasRef.current;
      const tableEl = tableEls.current.get(tableName);
      if (!canvas || !tableEl) return;

      const canvasRect = canvas.getBoundingClientRect();
      const tableCells = tableEl.getElementsByTagName("td");
      for (let i = 0; i < tableCells.length; i++) {
        if (getColumnFromTableCell(tableCells[i]) !== columnName) continue;

        const cellRect = tableCells[i].getBoundingClientRect();
        const cellTop = cellRect.top;
        const cellBtm = cellRect.bottom;
        const cellHeight = cellBtm - cellTop;
        joinStart.current.y = cellTop + cellHeight / 2;
        joinStart.current.x = joinSide === "right" ? cellRect.right : cellRect.left;

        joinStart.current.x = joinStart.current.x - canvasRect.left;
        joinStart.current.y = joinStart.current.y - canvasRect.top - 6;
      }
    },
    [getColumnFromTableCell]
  );

  /** Original: setJoinEndPosition(tableName, columnName, joinSide). */
  const setJoinEndPosition = useCallback(
    (tableName: string, columnName: string, joinSide: "left" | "right") => {
      const canvas = canvasRef.current;
      const tableEl = tableEls.current.get(tableName);
      if (!canvas || !tableEl) return;

      const canvasRect = canvas.getBoundingClientRect();
      const tableCells = tableEl.getElementsByTagName("td");
      for (let i = 0; i < tableCells.length; i++) {
        if (getColumnFromTableCell(tableCells[i]) !== columnName) continue;

        const cellRect = tableCells[i].getBoundingClientRect();
        const cellTop = cellRect.top;
        const cellBtm = cellRect.bottom;
        const cellHeight = cellBtm - cellTop;
        joinEnd.current.y = cellTop + cellHeight / 2;
        joinEnd.current.x = joinSide === "right" ? cellRect.right : cellRect.left;

        joinEnd.current.x = joinEnd.current.x - canvasRect.left;
        joinEnd.current.y = joinEnd.current.y - canvasRect.top - 6;
      }
    },
    [getColumnFromTableCell]
  );

  /** Original: highlightJoins() — the joined cells get the 'involved' class. */
  const joinedCellKeys = useMemo(() => {
    const keys: string[] = [];
    for (const join of selectedJoins) {
      keys.push(columnKey(join.tableAName, join.tableAColumn));
      keys.push(columnKey(join.tableBName, join.tableBColumn));
    }
    return keys;
  }, [selectedJoins]);

  const involvedCellKeys = useMemo(() => {
    if (pendingJoin.tableAName === "") return joinedCellKeys;
    return [...joinedCellKeys, columnKey(pendingJoin.tableAName, pendingJoin.tableAColumn)];
  }, [joinedCellKeys, pendingJoin]);

  /** Original: drawJoins(). */
  const drawJoins = useCallback(() => {
    clearCanvas();

    for (const join of selectedJoins) {
      // Figure out which table is towards the left.
      const leftmostTable = calcLeftmostTable(join.tableAName, join.tableBName);

      if (join.tableAName === leftmostTable) {
        setJoinStartPosition(join.tableAName, join.tableAColumn, "right");
        setJoinEndPosition(join.tableBName, join.tableBColumn, "left");
      } else {
        setJoinStartPosition(join.tableAName, join.tableAColumn, "left");
        setJoinEndPosition(join.tableBName, join.tableBColumn, "right");
      }

      drawLine();
    }
  }, [
    calcLeftmostTable,
    clearCanvas,
    drawLine,
    selectedJoins,
    setJoinEndPosition,
    setJoinStartPosition,
  ]);

  /** Original: resetCells(). */
  const resetCells = useCallback(() => {
    setSelectableTables(droppedTables);
  }, [droppedTables]);

  /** Original: resetPending(). */
  const resetPending = useCallback(() => {
    setPendingJoin(emptyJoin());
  }, []);

  /** Redraw whenever joins, pending state, dropped tables or positions change. */
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      drawJoins();
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, drawJoins, droppedTables, positions, showingJoinSelector, pendingJoin]);

  /** Original: setCanvasSize() + matchHeights(). */
  const setCanvasSize = useCallback(() => {
    const centerStage = centerStageRef.current;
    const canvas = canvasRef.current;
    const tblStack = tableStackRef.current;
    if (!centerStage || !canvas) return;

    const stageWidth = centerStage.clientWidth - 20;
    const stageHeight = centerStage.clientHeight - 20;
    canvas.setAttribute("width", String(stageWidth));
    canvas.setAttribute("height", String(stageHeight));
    centerStage.style.padding = "0";

    if (typeof window !== "undefined" && window.innerHeight < 721) {
      const joinSelector = document.getElementById("join-selector");
      if (joinSelector) joinSelector.style.zoom = "0.76";
    }

    if (tblStack) {
      const heightA = centerStage.getBoundingClientRect().height;
      const heightB = tblStack.getBoundingClientRect().height;
      if (heightB > heightA) {
        tblStack.style.height = `${heightA}px`;
      }
    }
  }, []);

  /* ─── Boot (original: DOMContentLoaded → setTables → startQueryBuilder) ── */

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot boot flag; the DOM-measuring effects below run on the following pass.
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setCanvasSize();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial canvas measurement/cell reset needs the mounted DOM
    resetCells();

    const onResize = () => {
      setCanvasSize();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* ─── Global listeners (original: window mouseup + Escape + interval) ──── */

  useEffect(() => {
    if (!ready) return;

    const onMouseUp = () => {
      if (isDrawing.current === true) {
        drawLine();
        isDrawing.current = false;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.parent.postMessage("close_query_builder", "*");
      }
    };

    window.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ready, drawLine]);

  /** Original: setInterval(cleanUpCanvas, 2000). */
  useEffect(() => {
    if (!ready) return;

    const timer = setInterval(() => {
      // ONLY joined cells should be highlighted (unless drawing).
      if (
        isDrawing.current === false &&
        pendingJoin.tableAName !== "" &&
        pendingJoin.tableBName === ""
      ) {
        resetPending();
        setSelectableTables(droppedTables);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [ready, pendingJoin, resetPending, droppedTables]);

  /* ─── Canvas mouse events (original: addCanvasMouseEventListeners) ────── */

  const handleCanvasMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    joinStart.current = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY };
    joinEnd.current = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY };
    isDrawing.current = true;
  };

  const handleCanvasMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (isDrawing.current === true) {
      joinEnd.current = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY };
      drawLine();
      joinStart.current = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY };
    }
  };

  /* ─── Table cells (original: watchTableCells) ─────────────────────────── */

  const handleCellClick = (
    tableId: string,
    columnName: string,
    event: ReactMouseEvent<HTMLTableCellElement>
  ) => {
    const clickedElType = (event.target as HTMLInputElement).type;
    const cellText = columnName;

    if (clickedElType === "checkbox" || cellText === "*") {
      return;
    }

    // Original: makeTableUnselectable(table).
    setSelectableTables((current) => current.filter((id) => id !== tableId));

    if (pendingJoin.tableAName === "") {
      setPendingJoin({
        tableAName: tableId,
        tableAColumn: columnName,
        tableBName: "",
        tableBColumn: "",
        joinType: "",
      });

      // Original: the pending join line starts at the mouse position.
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        joinStart.current = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }
      isDrawing.current = true;
    } else {
      if (tableId === pendingJoin.tableAName) {
        resetPending();
        isDrawing.current = false;
      } else {
        setPendingJoin((current) => ({
          ...current,
          tableBName: tableId,
          tableBColumn: columnName,
        }));
        drawJoinOptions(); // to get join type
      }
    }
  };

  /* ─── Join selector (original: drawJoinOptions / selectJoin) ──────────── */

  const drawJoinOptions = () => {
    setShowingJoinSelector(true);
  };

  const selectJoin = (joinIndex: number) => {
    setShowingJoinSelector(false);
    const join = { ...pendingJoin, joinType: joinTypes[joinIndex] };
    setSelectedJoins((current) => [...current, join]);
    resetPending();
  };

  /* ─── Drag & drop (original: watchTableStack / watchCanvas) ───────────── */

  const handleDragStart = (tableId: string, event: DragEvent<HTMLTableElement>) => {
    dragSourceRef.current = tableId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tableId);
  };

  const handleStackDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const tableId = dragSourceRef.current;
    if (!tableId) return;

    setDroppedTables((current) => current.filter((id) => id !== tableId));
    clearRemovedTable(tableId);
    dragSourceRef.current = null;
  };

  const handleCanvasDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const tableId = dragSourceRef.current;
    const centerStage = centerStageRef.current;
    if (!tableId || !centerStage) return;

    const rect = centerStage.getBoundingClientRect();
    setPositions((current) => ({
      ...current,
      [tableId]: { x: event.clientX - rect.left, y: event.clientY - rect.top },
    }));
    setDroppedTables((current) =>
      current.includes(tableId) ? current : [...current, tableId]
    );

    // Original: makeTableUnselectable was only applied once a join started;
    // resetCells() re-enables every dropped table after a drop.
    setSelectableTables((current) =>
      current.includes(tableId) ? current : [...current, tableId]
    );
    dragSourceRef.current = null;
  };

  /** Original: clearRemovedTable(selectedTable). */
  const clearRemovedTable = (tableId: string) => {
    // Remove this table from droppedTables and from selectedJoins.
    setSelectedJoins((current) =>
      current.filter(
        (join) => join.tableAName !== tableId && join.tableBName !== tableId
      )
    );

    // Uncheck every checkbox belonging to the removed table.
    setCheckedAll((current) => current.filter((id) => id !== tableId));
    setCheckedColumns((current) =>
      current.filter((key) => !key.startsWith(`${tableId}~`))
    );

    setSelectableTables((current) => current.filter((id) => id !== tableId));
    resetPending();
  };

  /* ─── Checkboxes (original: invokeSelectAll / untickSelectAll) ────────── */

  const invokeSelectAll = (tableId: string, checked: boolean) => {
    if (checked) {
      // Make all of the other checkboxes NOT checked.
      setCheckedColumns((current) =>
        current.filter((key) => !key.startsWith(`${tableId}~`))
      );
      setCheckedAll((current) =>
        current.includes(tableId) ? current : [...current, tableId]
      );
    } else {
      setCheckedAll((current) => current.filter((id) => id !== tableId));
    }
  };

  const untickSelectAll = (tableId: string, checked: boolean) => {
    if (checked) {
      setCheckedAll((current) => current.filter((id) => id !== tableId));
    }
  };

  const toggleColumnCheck = (
    tableId: string,
    columnName: string,
    checked: boolean
  ) => {
    const key = columnKey(tableId, columnName);
    setCheckedColumns((current) => {
      if (checked) {
        return current.includes(key) ? current : [...current, key];
      }
      return current.filter((entry) => entry !== key);
    });
    untickSelectAll(tableId, checked);
  };

  /* ─── SQL generation (original: buildSQL and helpers) ─────────────────── */

  const attemptTableFlipFix = (primaryTable: string, joins: SelectedJoin[]) => {
    const declaredTableAList: string[] = [];
    const declaredTableBList: string[] = [primaryTable];

    const flipped = joins.map((join) => ({ ...join }));

    for (let i = 0; i < flipped.length; i++) {
      const tableAName = flipped[i].tableAName;
      const tableAColumn = flipped[i].tableAColumn;
      const tableBName = flipped[i].tableBName;
      const tableBColumn = flipped[i].tableBColumn;

      // Check to see if tableA and tableB conflict with previously declared things.
      const x = declaredTableAList.includes(tableAName);
      const y = declaredTableBList.includes(tableBName);

      if (x === true || y === true) {
        // Conflicts with previously declared vibe!
        flipped[i].tableAName = tableBName;
        flipped[i].tableAColumn = tableBColumn;
        flipped[i].tableBName = tableAName;
        flipped[i].tableBColumn = tableAColumn;
      }

      // Add to declaredTable vibes...
      declaredTableAList.push(flipped[i].tableAName);
      declaredTableBList.push(flipped[i].tableBName);
    }

    return flipped;
  };

  const getJoinClauseDefault = (selectedJoinObj: SelectedJoin) => {
    const tableAName = selectedJoinObj.tableAName;
    const tableBName = selectedJoinObj.tableBName;
    const tableAColumn = selectedJoinObj.tableAColumn;
    const tableBColumn = selectedJoinObj.tableBColumn;

    const joinName = selectedJoinObj.joinType.toUpperCase();
    let joinCode = joinName + nl + ind + tableBName;
    joinCode += nl + "ON" + nl;
    const connection = `${ind}${tableAName}.${tableAColumn} = ${tableBName}.${tableBColumn}`;
    joinCode += connection;
    return joinCode;
  };

  const getJoinClauseLeftExcluding = (selectedJoinObj: SelectedJoin) => {
    const defaultJoin = getJoinClauseDefault(selectedJoinObj);
    let additionalCode = nl + "WHERE" + nl;
    const foreignKey = `${selectedJoinObj.tableBName}.${selectedJoinObj.tableBColumn}`;
    // Deliberately IS NULL, not = 0: this tests the LEFT JOIN's output,
    // which is always NULL on the right-hand side for unmatched rows —
    // regardless of whether the FK column itself defaults to 0 or NULL.
    additionalCode += ind + foreignKey + " IS NULL";
    let thisJoin = defaultJoin + additionalCode;
    thisJoin = thisJoin.replace(" EXCLUDING ", " ");
    thisJoin = thisJoin.replaceAll("LEFT JOIN", nl + "LEFT JOIN");
    return thisJoin;
  };

  const getJoinClauseRightExcluding = (selectedJoinObj: SelectedJoin) => {
    const defaultJoin = getJoinClauseDefault(selectedJoinObj);
    let additionalCode = nl + "WHERE" + nl;
    const foreignKey = `${selectedJoinObj.tableAName}.${selectedJoinObj.tableAColumn}`;
    // Deliberately IS NULL, not = 0: this tests the RIGHT JOIN's output,
    // which is always NULL on the left-hand side for unmatched rows —
    // regardless of whether the FK column itself defaults to 0 or NULL.
    additionalCode += ind + foreignKey + " IS NULL";
    let thisJoin = defaultJoin + additionalCode;
    thisJoin = thisJoin.replace(" EXCLUDING ", " ");
    thisJoin = thisJoin.replaceAll("RIGHT JOIN", nl + "RIGHT JOIN");
    return thisJoin;
  };

  const getJoinClauseFullJoin = (selectedJoinObj: SelectedJoin, sql: string) => {
    // Get code for a left outer join.
    const leftJoinCode = getJoinClauseDefault({
      ...selectedJoinObj,
      joinType: "left outer join",
    });

    let thisJoin = leftJoinCode + nl + "UNION" + nl + sql;

    // Get code for a right outer join.
    const rightJoinCode = getJoinClauseDefault({
      ...selectedJoinObj,
      joinType: "right outer join",
    });

    thisJoin = thisJoin.replace(nl + "LEFT OUTER JOIN", "LEFT OUTER JOIN");
    thisJoin += rightJoinCode;
    thisJoin = thisJoin.replace(nl + "RIGHT OUTER JOIN", "RIGHT OUTER JOIN");
    return thisJoin;
  };

  const getJoinClauseOuterExcludingJoin = (
    selectedJoinObj: SelectedJoin,
    sql: string
  ) => {
    // Get code for a left excluding join.
    const leftJoinCode = getJoinClauseLeftExcluding({
      ...selectedJoinObj,
      joinType: "left excluding join",
    });

    let thisJoin = nl + leftJoinCode + nl + "UNION ALL" + nl + sql;

    // Get code for a right excluding join.
    const rightJoinCode = getJoinClauseRightExcluding({
      ...selectedJoinObj,
      joinType: "right excluding join",
    });

    thisJoin += nl + rightJoinCode;
    return thisJoin;
  };

  const addJoinClauses = (sql: string, joins: SelectedJoin[]) => {
    let joinClauses = "";

    for (const join of joins) {
      let newJoinClause: string;

      switch (join.joinType) {
        case "right excluding join":
          newJoinClause = getJoinClauseRightExcluding(join);
          break;
        case "full join":
          newJoinClause = getJoinClauseFullJoin(join, sql);
          break;
        case "outer excluding join":
          newJoinClause = getJoinClauseOuterExcludingJoin(join, sql);
          break;
        case "left excluding join":
          newJoinClause = getJoinClauseLeftExcluding(join);
          break;
        default: // inner join, left outer or right outer
          newJoinClause = getJoinClauseDefault(join);
      }

      joinClauses += newJoinClause;
    }

    return sql + joinClauses;
  };

  const addSelectoids = (sql: string) => {
    let selectoids = "SELECT";

    for (const tableId of droppedTables) {
      const table = tableById(tableId);
      if (!table) continue;

      if (checkedAll.includes(tableId)) {
        selectoids += `${nl}${ind}${tableId}.*,`;
      }

      for (const columnName of table.columns) {
        if (checkedColumns.includes(columnKey(tableId, columnName))) {
          selectoids += `${nl}${ind}${tableId}.${columnName},`;
        }
      }
    }

    selectoids += "~~FIN";

    selectoids = selectoids.replaceAll(",~~FIN", "");
    return sql.replace("SELECTOIDS", selectoids);
  };

  const buildSQL = (): string => {
    let sql = "";
    let errorMsg = "";

    // NOTE: the PHP/JS original compared the arrays themselves
    // (droppedTables < 1) which can never be true; the port checks lengths so
    // the intended validation messages actually appear.
    if (droppedTables.length < 1) {
      errorMsg = "You did not select any tables!";
    }

    if (selectedJoins.length < 1 && errorMsg === "") {
      errorMsg = "You did not draw any table joins!";
    }

    if (errorMsg === "") {
      // Figure out how many selected boxes we have.
      let numCheckedBoxes = 0;
      for (const tableId of droppedTables) {
        const table = tableById(tableId);
        if (!table) continue;
        if (checkedAll.includes(tableId)) {
          numCheckedBoxes++;
        }
        for (const columnName of table.columns) {
          if (checkedColumns.includes(columnKey(tableId, columnName))) {
            numCheckedBoxes++;
          }
        }
      }

      if (numCheckedBoxes < 1) {
        errorMsg = "You did select any table columns to fetch!";
      }
    }

    if (errorMsg !== "") {
      sql = errorMsg;
    } else {
      // Let's figure out what the primary table is.
      const primaryTable = selectedJoins[0].tableAName;
      const joins = attemptTableFlipFix(primaryTable, selectedJoins);
      sql = "SELECTOIDS FROM" + nl + ind + primaryTable;
      sql = addSelectoids(sql);
      sql = addJoinClauses(sql, joins);
    }

    return sql;
  };

  /* ─── Buttons (original: showSQL / hideSQL / copySQL / restart) ───────── */

  const showSQL = () => {
    const sqlQuery = buildSQL();
    const isError = !sqlQuery.includes("FROM");

    setCopyBtnLabel(isError ? "Close Window" : "Copy SQL");

    let niceQuery = sqlQuery.replace(/FROM/g, "\nFROM");
    niceQuery = niceQuery.replace(/LEFT OUTER JOIN/g, "\nLEFT OUTER JOIN");
    niceQuery = niceQuery.replace(/RIGHT OUTER JOIN/g, "\nRIGHT OUTER JOIN");
    niceQuery = niceQuery.replace(/RIGHT EXCLUDING JOIN/g, "\nRIGHT EXCLUDING JOIN");
    niceQuery = niceQuery.replace(/FULL JOIN/g, "\nFULL JOIN");
    niceQuery = niceQuery.replace(/LEFT EXCLUDING JOIN/g, "\nLEFT EXCLUDING JOIN");
    niceQuery = niceQuery.replace(/INNER JOIN/g, "\nINNER JOIN");
    niceQuery = niceQuery.trim();

    setSqlText(niceQuery);
    setShowSql(true);
    setShowingJoinSelector(false);
  };

  const hideSQL = () => {
    setShowSql(false);
  };

  /** Original: modifyCloseBtn(). */
  const modifyCloseBtn = () => {
    setCopyBtnLabel((current) =>
      current === "Copy SQL" ? "Close Window" : "Copy SQL"
    );
  };

  const copySQL = () => {
    if (copyBtnLabel !== "Copy SQL") {
      modifyCloseBtn();
      hideSQL();
    } else {
      void navigator.clipboard.writeText(sqlText);
      setCopyBtnLabel("copied!");
      setTimeout(() => {
        hideSQL();
        setCopyBtnLabel("Copy SQL");
      }, 633);
    }
  };

  const clearJoins = () => {
    setSelectedJoins([]);
    resetPending();
  };

  const restart = () => {
    setSelectedJoins([]);
    setDroppedTables([]);
    setPositions({});
    setCheckedAll([]);
    setCheckedColumns([]);
    setSelectableTables([]);
    setShowingJoinSelector(false);
    setShowSql(false);
    setSqlText("");
    resetPending();
    // Original rebuilt every page element via buildPageElements(); the React
    // equivalent is a clean re-render from the same tables payload.
    setTimeout(() => setSelectableTables([]), 0);
  };

  const closeWindow = () => {
    window.parent.postMessage("close_query_builder", "*");
  };

  /* ─── Render ──────────────────────────────────────────────────────────── */

  const base = "/trongate_control-query_builder_module";

  if (!ready) {
    return (
      <>
        <PageAssets base={base} />
        <div id="loading-msg">
          <div>Loading tables...</div>
          <div className="spinner"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageAssets base={base} />

      <div id="buttons">
        <button onClick={restart}>restart</button>
        <button onClick={clearJoins}>clear joins</button>
        {!showSql ? <button id="show-sql-btn" onClick={showSQL}>show SQL</button> : null}
        {showSql ? (
          <button id="hide-sql-btn" onClick={hideSQL}>
            hide SQL
          </button>
        ) : null}
        <button onClick={closeWindow}>close window</button>
      </div>

      <div id="main">
        <div id="table-stack" ref={tableStackRef} onDragOver={allowDrop} onDrop={handleStackDrop}>
          {tables
            .filter((table) => !droppedTables.includes(table.id))
            .map((table) => (
              <BuilderTable
                key={table.id}
                table={table}
                hideCells
                onDragStart={handleDragStart}
                tableEls={tableEls}
                selectable={selectableTables.includes(table.id)}
                involvedCellKeys={involvedCellKeys}
                checkedAll={checkedAll.includes(table.id)}
                checkedColumns={checkedColumns}
                onSelectAll={invokeSelectAll}
                onToggleColumn={toggleColumnCheck}
                onCellClick={handleCellClick}
                interactive={false}
              />
            ))}
        </div>

        <div id="center-stage" ref={centerStageRef} onDragOver={allowDrop} onDrop={handleCanvasDrop}>
          <canvas
            id="myCanvas"
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
          />

          {tables
            .filter((table) => droppedTables.includes(table.id))
            .map((table) => {
              const position = positions[table.id] ?? { x: 0, y: 0 };
              return (
                <div
                  key={table.id}
                  className="qb-dropped-table"
                  style={{ position: "absolute", left: position.x, top: position.y, zIndex: 5 }}
                >
                  <BuilderTable
                    table={table}
                    hideCells={false}
                    onDragStart={handleDragStart}
                    tableEls={tableEls}
                    selectable={selectableTables.includes(table.id)}
                    involvedCellKeys={involvedCellKeys}
                    checkedAll={checkedAll.includes(table.id)}
                    checkedColumns={checkedColumns}
                    onSelectAll={invokeSelectAll}
                    onToggleColumn={toggleColumnCheck}
                    onCellClick={handleCellClick}
                    interactive={true}
                  />
                </div>
              );
            })}
        </div>
      </div>

      <JoinSelector
        visible={showingJoinSelector}
        onSelect={selectJoin}
      />

      <div id="sql-code" style={{ display: showSql ? "block" : "none" }}>
        <div>
          <button id="copy-btn" onClick={copySQL}>
            {copyBtnLabel}
          </button>
        </div>
        <div>
          <textarea id="sql" value={sqlText} disabled readOnly />
        </div>
      </div>
    </>
  );

  function allowDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }
}

/* ─── Page assets (original: <head> links + hidden image preloads) ──────── */

function PageAssets({ base }: { base: string }) {
  return (
    <>
      <link rel="stylesheet" href={`${base}/css/table-joins.css`} />
      <link rel="stylesheet" href={`${base}/css/query_builder.css`} />
      <link rel="stylesheet" href={`${base}/css/query_builder_page.css`} />
      {/* Preload join images. */}
      <div style={{ display: "none" }}>
        {joinTypes.map((_joinType, index) => (
          <span key={index}>
            {/*
              Keyed images — the same files the join-type menu uses as
              backgrounds (active + dark variants).
            */}
            <img src={`${base}/images/joins/active/join${index + 1}.png`} alt="" />
            <img src={`${base}/images/joins/dark/join${index + 1}.png`} alt="" />
          </span>
        ))}
      </div>
    </>
  );
}

/* ─── Table rendering (original: populateTableStack) ────────────────────── */

function BuilderTable({
  table,
  hideCells,
  selectable,
  interactive,
  involvedCellKeys,
  checkedAll,
  checkedColumns,
  onDragStart,
  tableEls,
  onSelectAll,
  onToggleColumn,
  onCellClick,
}: {
  table: QueryBuilderTable;
  hideCells: boolean;
  selectable: boolean;
  interactive: boolean;
  involvedCellKeys: string[];
  checkedAll: boolean;
  checkedColumns: string[];
  onDragStart: (tableId: string, event: DragEvent<HTMLTableElement>) => void;
  tableEls: { current: Map<string, HTMLTableElement | null> };
  onSelectAll: (tableId: string, checked: boolean) => void;
  onToggleColumn: (tableId: string, columnName: string, checked: boolean) => void;
  onCellClick: (
    tableId: string,
    columnName: string,
    event: ReactMouseEvent<HTMLTableCellElement>
  ) => void;
}) {
  const tableClassName = [hideCells ? "hide-cells" : "", selectable ? "selectable" : ""]
    .filter(Boolean)
    .join(" ");

  const cellClassName = (columnName: string) =>
    [
      "selectable",
      involvedCellKeys.includes(`${table.id}~${columnName}`) ? "involved" : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <table
      id={table.id}
      className={tableClassName}
      draggable
      onDragStart={(event) => onDragStart(table.id, event)}
      ref={(element) => {
        tableEls.current.set(table.id, element);
      }}
    >
      <thead>
        <tr>
          <th title={table.id}>
            <span>{table.id}</span>
          </th>
        </tr>
      </thead>

      {/* A row for 'select *'. */}
      <tbody>
        <tr>
          <td>
            <input
              type="checkbox"
              id={`${SELECT_ALL_PREFIX}${table.id}`}
              className="select-all-checkbox"
              value={1}
              checked={checkedAll}
              disabled={!interactive}
              onChange={(event) => onSelectAll(table.id, event.target.checked)}
            />
            *
          </td>
        </tr>

        {table.columns.map((columnName) => (
          <tr key={columnName}>
            <td
              className={cellClassName(columnName)}
              onClick={(event) => {
                if (interactive) onCellClick(table.id, columnName, event);
              }}
            >
              <input
                type="checkbox"
                id={`${table.id}~${columnName}`}
                value={1}
                checked={checkedColumns.includes(`${table.id}~${columnName}`)}
                disabled={!interactive}
                onClick={(event) => {
                  if (interactive) {
                    onToggleColumn(table.id, columnName, event.currentTarget.checked);
                  }
                }}
                readOnly
              />
              {columnName}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Join-type menu (original: buildJoinSelector) ──────────────────────── */

function JoinSelector({
  visible,
  onSelect,
}: {
  visible: boolean;
  onSelect: (joinIndex: number) => void;
}) {
  return (
    <div id="join-selector" style={{ display: visible ? "block" : "none" }}>
      <h2>Select Join Types</h2>
      <div id="joins-menu">
        {joinMenuOptions.map((option, index) => (
          <div
            key={option}
            id={`join-option-${index + 1}`}
            className="join-option"
            onClick={() => onSelect(index)}
          >
            {option}
          </div>
        ))}
      </div>
    </div>
  );
}
