
export const toCSV = (data: any[], columns: { header: string; key: string | ((row: any) => any) }[]) => {
  if (!data || !data.length) {
    return '';
  }

  // Header row
  const headerRow = columns.map(col => `"${col.header}"`).join(',');

  // Data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value;
      if (typeof col.key === 'function') {
        value = col.key(row);
      } else {
        value = row[col.key];
      }

      if (value === null || value === undefined) {
        value = '';
      }

      // Escape quotes and wrap in quotes
      const stringValue = String(value).replace(/"/g, '""');
      return `"${stringValue}"`;
    }).join(',');
  });

  return [headerRow, ...rows].join('\n');
};

