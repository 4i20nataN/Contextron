import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText } from 'lucide-react';
import { Document } from '../types';

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  doc?: Document;
}

function buildTree(documents: Document[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isFolder: true, children: [] };
  for (const doc of documents) {
    const parts = doc.name.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.find(c => c.isFolder && c.name === part);
      if (!child) {
        child = { name: part, path, isFolder: true, children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({
      name: parts[parts.length - 1],
      path: doc.name,
      isFolder: false,
      children: [],
      doc
    });
  }
  return root;
}

function getLeafIds(node: TreeNode): string[] {
  if (!node.isFolder && node.doc) return [node.doc.id];
  return node.children.flatMap(getLeafIds);
}

interface NodeProps {
  node: TreeNode;
  selectedIds: Set<string>;
  onToggle: (ids: string[], selected: boolean) => void;
  depth: number;
}

const TreeNodeRow: React.FC<NodeProps> = ({ node, selectedIds, onToggle, depth }) => {
  const [expanded, setExpanded] = useState(depth < 1);

  if (!node.isFolder) {
    const selected = selectedIds.has(node.doc?.id || '');
    return (
      <div
        className="flex items-center gap-1.5 py-[3px] px-1 rounded hover:bg-white/5 cursor-pointer group"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => onToggle([node.doc!.id], !selected)}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => {}}
          className="w-3 h-3 accent-cyan-500 cursor-pointer shrink-0"
        />
        <FileText className={`w-3 h-3 shrink-0 ${node.doc?.isRefactored ? 'text-emerald-400' : 'text-cyan-500/40'}`} />
        <span className={`text-[9px] font-mono truncate flex-1 min-w-0 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
          {node.name}
        </span>
        <span className="text-[8px] font-mono text-slate-700 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {node.doc ? (node.doc.size / 1024).toFixed(1) : ''}K
        </span>
      </div>
    );
  }

  const leafIds = getLeafIds(node);
  const selectedCount = leafIds.filter(id => selectedIds.has(id)).length;
  const fullySelected = leafIds.length > 0 && selectedCount === leafIds.length;
  const partial = selectedCount > 0 && selectedCount < leafIds.length;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-[3px] px-1 rounded hover:bg-white/5"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <input
          type="checkbox"
          checked={fullySelected}
          ref={el => { if (el) el.indeterminate = partial; }}
          onChange={() => onToggle(leafIds, !fullySelected)}
          className="w-3 h-3 accent-cyan-500 cursor-pointer shrink-0"
        />
        <span
          className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded
            ? <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
            : <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
          {expanded
            ? <FolderOpen className="w-3 h-3 text-yellow-500/60 shrink-0" />
            : <Folder className="w-3 h-3 text-yellow-500/60 shrink-0" />}
          <span className="text-[9px] font-mono text-slate-400 font-semibold truncate">{node.name}/</span>
          <span className="text-[8px] font-mono text-slate-600 ml-1 shrink-0">{leafIds.length}</span>
        </span>
      </div>
      {expanded && node.children.map(child => (
        <TreeNodeRow
          key={child.path}
          node={child}
          selectedIds={selectedIds}
          onToggle={onToggle}
          depth={depth + 1}
        />
      ))}
    </div>
  );
};

interface FileTreeProps {
  documents: Document[];
  selectedIds: Set<string>;
  onToggle: (ids: string[], selected: boolean) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ documents, selectedIds, onToggle }) => {
  const tree = useMemo(() => buildTree(documents), [documents]);
  const allIds = useMemo(() => documents.map(d => d.id), [documents]);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 py-1 px-1 mb-0.5 border-b border-white/5">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => onToggle(allIds, !allSelected)}
          className="w-3 h-3 accent-cyan-500 cursor-pointer shrink-0"
        />
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
          {selectedIds.size}/{documents.length} selecionados
        </span>
        {selectedIds.size < documents.length && (
          <button
            onClick={() => onToggle(allIds, true)}
            className="ml-auto text-[8px] font-mono text-cyan-500/70 hover:text-cyan-400 transition-colors"
          >
            todos
          </button>
        )}
      </div>
      {tree.children.map(child => (
        <TreeNodeRow
          key={child.path}
          node={child}
          selectedIds={selectedIds}
          onToggle={onToggle}
          depth={0}
        />
      ))}
    </div>
  );
};
