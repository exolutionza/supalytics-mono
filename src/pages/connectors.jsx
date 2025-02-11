import React, { useEffect, useState } from 'react';
import { supabase } from '@/services/supabase-client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const ConnectorsPage = () => {
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchConnectors = async () => {
      try {
        const { data, error } = await supabase
          .from('connectors')
          .select(`
            id,
            name,
            type,
            status,
            last_connection_check,
            created_at,
            organizations (
              name
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setConnectors(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchConnectors();
  }, []);

  const getStatusBadge = (status) => {
    const statusColors = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      error: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800'
    };

    return (
      <Badge className={`${statusColors[status] || statusColors.inactive}`}>
        {status === 'active' ? <CheckCircle2 className="w-4 h-4 mr-1" /> : 
         status === 'error' ? <AlertCircle className="w-4 h-4 mr-1" /> : null}
        {status || 'Unknown'}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading connectors...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Error Loading Connectors</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Connectors</CardTitle>
          <CardDescription>
            Manage your data source connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Check</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connectors.map((connector) => (
                <TableRow key={connector.id}>
                  <TableCell className="font-medium">{connector.name}</TableCell>
                  <TableCell>{connector.type}</TableCell>
                  <TableCell>{connector.organizations?.name}</TableCell>
                  <TableCell>{getStatusBadge(connector.status)}</TableCell>
                  <TableCell>
                    {connector.last_connection_check 
                      ? new Date(connector.last_connection_check).toLocaleString()
                      : 'Never'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectorsPage;