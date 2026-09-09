import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

interface Category { id: string; name: string; description?: string; isActive: boolean; }

export const CategoriesPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();

  const { data } = useQuery<{ data: Category[] }>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((res) => res.data),
  });

  const saveMutation = useMutation({
    mutationFn: () => editing
      ? api.put(`/categories/${editing.id}`, { name, description })
      : api.post('/categories', { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setModalOpen(false);
      setEditing(null);
      setName('');
      setDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const openEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setDescription(c.description || '');
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-600 mt-1">Organize your products into categories</p>
        </div>
        <Button onClick={() => { setEditing(null); setName(''); setDescription(''); setModalOpen(true); }} variant="primary">
          <Plus size={16} className="mr-2" /> Add Category
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(data?.data || []).map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.description || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(c)} className="p-1 text-blue-600 mr-2"><Edit size={16} /></button>
                  <button onClick={() => deleteMutation.mutate(c.id)} className="p-1 text-red-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {(data?.data || []).length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No categories found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Category' : 'New Category'}>
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" />
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save</Button>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
