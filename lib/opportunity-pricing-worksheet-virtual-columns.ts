export type WorksheetVirtualColumnWindow<TColumn> = {
  offsets: number[];
  totalWidth: number;
  startIndex: number;
  endIndex: number;
  leftSpacerWidth: number;
  rightSpacerWidth: number;
  visibleColumns: TColumn[];
};

type VirtualColumnWidth = {
  width: number;
};

export function getColumnOffsets<TColumn extends VirtualColumnWidth>(columns: TColumn[]) {
  const offsets: number[] = new Array(columns.length + 1);
  offsets[0] = 0;

  for (let index = 0; index < columns.length; index += 1) {
    offsets[index + 1] = offsets[index] + columns[index].width;
  }

  return offsets;
}

export function getColumnVirtualizationWindow<TColumn extends VirtualColumnWidth>(
  columns: TColumn[],
  offsets: number[],
  scrollLeft: number,
  viewportWidth: number,
  overscan: number
): WorksheetVirtualColumnWindow<TColumn> {
  const totalWidth = offsets[columns.length] ?? 0;
  if (columns.length === 0) {
    return {
      offsets,
      totalWidth,
      startIndex: 0,
      endIndex: -1,
      leftSpacerWidth: 0,
      rightSpacerWidth: 0,
      visibleColumns: [],
    };
  }

  const normalizedScrollLeft = Math.max(0, scrollLeft);
  const normalizedViewportWidth = Math.max(1, viewportWidth);
  const viewportRight = normalizedScrollLeft + normalizedViewportWidth;

  let low = 0;
  let high = columns.length - 1;
  let firstVisibleIndex = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] < normalizedScrollLeft) {
      low = middle + 1;
    } else {
      firstVisibleIndex = middle;
      high = middle - 1;
    }
  }

  let lastVisibleIndex = firstVisibleIndex;
  while (
    lastVisibleIndex < columns.length - 1 &&
    (offsets[lastVisibleIndex] ?? 0) <= viewportRight
  ) {
    lastVisibleIndex += 1;
  }

  const startIndex = Math.max(0, firstVisibleIndex - overscan);
  const endIndex = Math.min(columns.length - 1, lastVisibleIndex + overscan);

  return {
    offsets,
    totalWidth,
    startIndex,
    endIndex,
    leftSpacerWidth: offsets[startIndex] ?? 0,
    rightSpacerWidth: Math.max(0, totalWidth - (offsets[endIndex + 1] ?? totalWidth)),
    visibleColumns: columns.slice(startIndex, endIndex + 1),
  };
}
