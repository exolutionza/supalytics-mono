import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, MoreVertical } from "lucide-react";

const DataGrid = ({ config, data }) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Define default configuration
  const defaultConfig = {
    columns: [],
    pageSize: 10,
    sortable: true,
    searchable: true,
    pagination: true,
  };

  // Merge default config with provided config
  const finalConfig = { ...defaultConfig, ...config };

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [data, sortConfig]);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm) return sortedData;

    return sortedData.filter(row => 
      Object.values(row).some(value => 
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [sortedData, searchTerm]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * finalConfig.pageSize;
    return filteredData.slice(startIndex, startIndex + finalConfig.pageSize);
  }, [filteredData, currentPage, finalConfig.pageSize]);

  // Handle sort
  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Custom cell renderer
  const renderCell = (row, column) => {
    if (column.renderCell) {
      return column.renderCell(row);
    }

    if (column.type === 'actions') {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {column.actions.map((action, index) => (
              <DropdownMenuItem 
                key={index}
                onClick={() => action.onClick(row)}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return row[column.field];
  };

  return (
    <div className="w-full">
      {finalConfig.searchable && (
        <div className="flex items-center py-4">
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {finalConfig.columns.map((column) => (
                <TableHead 
                  key={column.field}
                  className={finalConfig.sortable && column.sortable !== false ? 'cursor-pointer' : ''}
                  onClick={() => {
                    if (finalConfig.sortable && column.sortable !== false) {
                      handleSort(column.field);
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <span>{column.headerName}</span>
                    {finalConfig.sortable && column.sortable !== false && sortConfig.key === column.field && (
                      sortConfig.direction === 'asc' ? 
                        <ChevronUp className="h-4 w-4" /> : 
                        <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {finalConfig.columns.map((column) => (
                  <TableCell key={column.field}>
                    {renderCell(row, column)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {finalConfig.pagination && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => prev + 1)}
            disabled={currentPage * finalConfig.pageSize >= filteredData.length}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default DataGrid;