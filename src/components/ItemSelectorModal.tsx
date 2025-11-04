import React, { useState, useEffect } from "react";

interface ItemSelectorModalProps {
  collectionName: string;
  items: any[];
  total: number;
  selectedIds: (string | number)[];
  onSelectionChange: (ids: (string | number)[]) => void;
  onClose: () => void;
  onImport: (selectedFields?: string[]) => void; // Add selectedFields param
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  relations?: any[]; // Optional: for showing dependency notes
}

export function ItemSelectorModal({
  collectionName,
  items,
  total,
  selectedIds,
  onSelectionChange,
  onClose,
  onImport,
  onLoadMore,
  hasMore,
  loading,
  relations = [],
}: ItemSelectorModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [availableFields, setAvailableFields] = useState<
    { field: string; relationType: "m2o" | "o2m" | "m2m" | "m2a" | null }[]
  >([]);
  const [showFieldSelector, setShowFieldSelector] = useState(false);
  const [depFilter, setDepFilter] = useState<"all" | "needs" | "none">("all");
  const [selectionFilter, setSelectionFilter] = useState<
    "all" | "selected" | "unselected"
  >("all");
  const [fieldFilterField, setFieldFilterField] = useState<string>("");
  const [fieldFilterOp, setFieldFilterOp] = useState<
    "eq" | "contains" | "exists" | "not_exists"
  >("eq");
  const [fieldFilterValue, setFieldFilterValue] = useState<string>("");

  // Headless select box component
  function SelectBox({
    value,
    onChange,
    options,
    placeholder,
    disabled,
    width = "10rem",
  }: {
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
    disabled?: boolean;
    width?: string;
  }) {
    const [open, setOpen] = useState(false);
    const selected = options.find((o) => o.value === value);
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          onBlur={(e) => {
            // close when focus leaves the control z
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setOpen(false);
          }}
          disabled={disabled}
          style={{
            padding: "0.5rem 2rem 0.5rem 0.75rem",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            backgroundColor: disabled ? "#f3f4f6" : "white",
            color: disabled ? "#9ca3af" : "#111827",
            fontSize: "0.875rem",
            cursor: disabled ? "not-allowed" : "pointer",
            minWidth: width,
            position: "relative",
          }}
        >
          <span style={{ whiteSpace: "nowrap" }}>
            {selected?.label || placeholder || "Select"}
          </span>
          <span
            style={{
              position: "absolute",
              right: "0.5rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#6b7280",
            }}
          >
            ▾
          </span>
        </button>
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 50,
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              boxShadow:
                "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
              minWidth: width,
              maxHeight: "240px",
              overflowY: "auto",
            }}
            tabIndex={-1}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.5rem 0.75rem",
                  backgroundColor: opt.value === value ? "#eff6ff" : "white",
                  color: "#111827",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Get missing dependencies for an item (placed before filters to avoid TDZ)
  function getItemDependencies(
    item: any
  ): Array<{ field: string; collection: string; value: any }> {
    if (!relations || relations.length === 0) return [];
    const missingDeps: Array<{
      field: string;
      collection: string;
      value: any;
    }> = [];
    relations.forEach((relation: any) => {
      if (
        relation.collection === collectionName &&
        relation.related_collection
      ) {
        const fieldName = relation.field;
        const relatedCollection = relation.related_collection;
        if (item[fieldName] !== null && item[fieldName] !== undefined) {
          missingDeps.push({
            field: fieldName,
            collection: relatedCollection,
            value: item[fieldName],
          });
        }
      }
    });
    return missingDeps;
  }

  // Extract available fields from items with relation-aware detection and typed tags
  useEffect(() => {
    if (items.length > 0) {
      const firstItem = items[0];
      const fields: {
        field: string;
        relationType: "m2o" | "o2m" | "m2m" | "m2a" | null;
      }[] = [];
      const systemFields = [
        "id",
        "date_created",
        "date_updated",
        "user_created",
        "user_updated",
      ];
      const relsForCollection = (relations || []).filter(
        (rel: any) => rel?.collection === collectionName && rel?.field
      );
      const relationFieldNames = new Set<string>(
        relsForCollection.map((rel: any) => String(rel.field))
      );

      Object.keys(firstItem).forEach((key) => {
        if (systemFields.includes(key)) return;

        const value = firstItem[key];
        const looksLikeArrayRelation = Array.isArray(value);
        const looksLikeId =
          typeof value === "string" || typeof value === "number";
        const nameLooksLikeFk =
          key.endsWith("_id") ||
          key.endsWith("_ids") ||
          key === "parent" ||
          key === "parent_id";

        let relationType: "m2o" | "o2m" | "m2m" | "m2a" | null = null;

        // If present in Directus relations metadata, infer type
        if (relationFieldNames.has(key)) {
          const rel = relsForCollection.find(
            (r: any) => String(r.field) === key
          );
          const hasJunction = !!(
            rel?.junction_collection ||
            rel?.meta?.junction_field ||
            rel?.schema?.junction_table
          );
          const isPolymorphic =
            rel?.related_collection == null ||
            !!rel?.meta?.one_field ||
            !!rel?.meta?.one_collection_field;
          if (hasJunction) {
            relationType = "m2m";
          } else if (isPolymorphic && looksLikeArrayRelation) {
            // Many-to-any (array of mixed collection references)
            relationType = "m2a";
          } else if (looksLikeArrayRelation) {
            relationType = "o2m";
          } else {
            relationType = "m2o";
          }
        } else if (looksLikeArrayRelation) {
          // Heuristic: array of objects with collection/id keys → m2a
          const first =
            Array.isArray(value) && value.length > 0 ? value[0] : null;
          const looksLikePolymorphic =
            first &&
            typeof first === "object" &&
            ("collection" in first || "collection_name" in first) &&
            ("id" in first || "item" in first);
          relationType = looksLikePolymorphic ? "m2a" : "m2m";
        } else if (nameLooksLikeFk && looksLikeId) {
          relationType = "m2o";
        }

        fields.push({ field: key, relationType });
      });

      setAvailableFields(fields);
    }
  }, [items, relations, collectionName]);

  // Filter items based on search
  const filteredItems = items.filter((item) => {
    // Search text filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const searchableText = [
        item.id,
        item.title,
        item.name,
        item.email,
        item.status,
        JSON.stringify(item),
      ]
        .join(" ")
        .toLowerCase();
      if (!searchableText.includes(searchLower)) return false;
    }

    // Dependencies filter
    if (depFilter !== "all") {
      const needs = getItemDependencies(item).length > 0;
      if (depFilter === "needs" && !needs) return false;
      if (depFilter === "none" && needs) return false;
    }

    // Selection filter
    if (selectionFilter !== "all") {
      const isSelected = selectedIds.includes(item.id);
      if (selectionFilter === "selected" && !isSelected) return false;
      if (selectionFilter === "unselected" && isSelected) return false;
    }

    // Field filter
    if (fieldFilterField) {
      const v = item[fieldFilterField];
      if (fieldFilterOp === "exists") {
        const exists =
          v !== null &&
          v !== undefined &&
          !(typeof v === "string" && v.trim() === "");
        if (!exists) return false;
      } else if (fieldFilterOp === "not_exists") {
        const exists =
          v !== null &&
          v !== undefined &&
          !(typeof v === "string" && v.trim() === "");
        if (exists) return false;
      } else if (fieldFilterOp === "eq") {
        if (fieldFilterValue.trim() === "") return false;
        if (String(v) !== fieldFilterValue) return false;
      } else if (fieldFilterOp === "contains") {
        if (fieldFilterValue.trim() === "") return false;
        const text = typeof v === "string" ? v : JSON.stringify(v);
        if (!text.toLowerCase().includes(fieldFilterValue.toLowerCase()))
          return false;
      }
    }

    return true;
  });

  const handleToggleItem = (id: string | number) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectAll) {
      onSelectionChange([]);
    } else {
      onSelectionChange(filteredItems.map((item) => item.id));
    }
    setSelectAll(!selectAll);
  };

  // Update selectAll state when selection changes
  useEffect(() => {
    setSelectAll(
      filteredItems.length > 0 &&
        filteredItems.every((item) => selectedIds.includes(item.id))
    );
  }, [selectedIds, filteredItems]);

  // Get display value for an item
  const getItemDisplayText = (item: any): string => {
    // Try common display fields
    return (
      item.title || item.name || item.email || item.label || `Item ${item.id}`
    );
  };

  // Get item preview (first few fields)
  const getItemPreview = (item: any): string => {
    const excludeKeys = [
      "id",
      "date_created",
      "date_updated",
      "user_created",
      "user_updated",
    ];
    const previewKeys = Object.keys(item)
      .filter((key) => !excludeKeys.includes(key))
      .slice(0, 3);

    return previewKeys
      .map((key) => {
        const value = item[key];
        if (typeof value === "object") return `${key}: [object]`;
        if (typeof value === "string" && value.length > 50)
          return `${key}: ${value.substring(0, 50)}...`;
        return `${key}: ${value}`;
      })
      .join(", ");
  };

  // (moved above for hoisting via function declaration)

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          maxWidth: "900px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.5rem",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "#111827",
              }}
            >
              Select Items to Migrate
            </h2>
            <p
              style={{
                margin: "0.5rem 0 0 0",
                fontSize: "0.875rem",
                color: "#6b7280",
              }}
            >
              Collection: <strong>{collectionName}</strong> | Total: {total}{" "}
              items | Selected: {selectedIds.length}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: "#6b7280",
              padding: "0.5rem",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Field Selector */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
          }}
        >
          <button
            onClick={() => setShowFieldSelector(!showFieldSelector)}
            style={{
              backgroundColor: "white",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              padding: "0.5rem 1rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: "500",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            🔧 Select Fields to Migrate
            {selectedFields.length > 0 &&
              ` (${selectedFields.length} selected)`}
            <span style={{ marginLeft: "auto" }}>
              {showFieldSelector ? "▲" : "▼"}
            </span>
          </button>

          {showFieldSelector && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "1rem",
                backgroundColor: "white",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                maxHeight: "300px",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  marginBottom: "0.75rem",
                  display: "flex",
                  gap: "0.5rem",
                }}
              >
                <button
                  onClick={() =>
                    setSelectedFields(availableFields.map((f) => f.field))
                  }
                  style={{
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedFields([])}
                  style={{
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                  }}
                >
                  Clear All
                </button>
                <button
                  onClick={() =>
                    setSelectedFields(
                      availableFields
                        .filter((f) => f.relationType === null)
                        .map((f) => f.field)
                    )
                  }
                  style={{
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "#10b981",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                  }}
                >
                  Only Regular Fields
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {availableFields.map(({ field, relationType }) => (
                  <label
                    key={field}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem",
                      backgroundColor: relationType ? "#fef3c7" : "#f3f4f6",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFields([...selectedFields, field]);
                        } else {
                          setSelectedFields(
                            selectedFields.filter((f) => f !== field)
                          );
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.875rem", fontWeight: "500" }}>
                      {field}
                      {relationType && (
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            color: "#f59e0b",
                            fontSize: "0.75rem",
                          }}
                        >
                          🔗 {relationType.toUpperCase()}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              {selectedFields.length === 0 && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.75rem",
                    backgroundColor: "#eff6ff",
                    borderLeft: "3px solid #3b82f6",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    color: "#1e40af",
                  }}
                >
                  ℹ️ No fields selected = Migrate all fields (default behavior)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search and Select All */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "0.875rem",
            }}
          />

          {/* Field filter: field */}
          <SelectBox
            value={fieldFilterField}
            onChange={setFieldFilterField}
            options={[
              { value: "", label: "— Field —" },
              ...Object.keys(items[0] || {})
                .filter(
                  (k) =>
                    ![
                      "id",
                      "date_created",
                      "date_updated",
                      "user_created",
                      "user_updated",
                    ].includes(k)
                )
                .map((k) => ({ value: k, label: k })),
            ]}
            placeholder="— Field —"
            width="12rem"
          />

          {/* Field filter: operator */}
          <SelectBox
            value={fieldFilterOp}
            onChange={(v) => setFieldFilterOp(v as any)}
            options={[
              { value: "eq", label: "Equals" },
              { value: "contains", label: "Contains" },
              { value: "exists", label: "Exists" },
              { value: "not_exists", label: "Not exists" },
            ]}
            placeholder="Operator"
            width="10rem"
          />

          {/* Field filter: value */}
          <input
            type="text"
            placeholder={
              fieldFilterOp === "exists" || fieldFilterOp === "not_exists"
                ? "(ignored)"
                : "value"
            }
            value={fieldFilterValue}
            onChange={(e) => setFieldFilterValue(e.target.value)}
            disabled={
              !fieldFilterField ||
              fieldFilterOp === "exists" ||
              fieldFilterOp === "not_exists"
            }
            style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "0.875rem",
              width: "12rem",
            }}
          />

          {/* Clear filters */}
          <button
            onClick={() => {
              setDepFilter("all");
              setSelectionFilter("all");
              setFieldFilterField("");
              setFieldFilterValue("");
              setFieldFilterOp("eq");
              setSearchTerm("");
            }}
            style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              backgroundColor: "white",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
            title="Clear all filters"
          >
            Reset
          </button>

          {/* Dependencies filter */}
          <SelectBox
            value={depFilter}
            onChange={(v) => setDepFilter(v as any)}
            options={[
              { value: "all", label: "All" },
              { value: "needs", label: "Needs dependencies" },
              { value: "none", label: "No dependencies" },
            ]}
            placeholder="Dependencies"
            width="12rem"
          />

          {/* Selection filter */}
          <SelectBox
            value={selectionFilter}
            onChange={(v) => setSelectionFilter(v as any)}
            options={[
              { value: "all", label: "All items" },
              { value: "selected", label: "Selected" },
              { value: "unselected", label: "Unselected" },
            ]}
            placeholder="Selection"
            width="12rem"
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: "500",
              whiteSpace: "nowrap",
            }}
          >
            <input
              type="checkbox"
              checked={selectAll}
              onChange={handleSelectAll}
              style={{ width: "1rem", height: "1rem", cursor: "pointer" }}
            />
            Select All ({filteredItems.length})
          </label>
        </div>

        {/* Items List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1rem 1.5rem",
          }}
        >
          {/* Showing X of Y info */}
          {!loading && items.length > 0 && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                backgroundColor: searchTerm ? "#fef3c7" : "#f0fdf4",
                borderRadius: "6px",
                fontSize: "0.875rem",
                color: "#374151",
                fontWeight: "500",
                textAlign: "center",
                border: searchTerm ? "1px solid #fbbf24" : "1px solid #86efac",
              }}
            >
              {searchTerm ? (
                <>
                  Found {filteredItems.length} of {items.length} items matching
                  "{searchTerm}"
                </>
              ) : (
                <>
                  ✅ All {items.length} items loaded
                  {items.length !== total && (
                    <span style={{ color: "#dc2626", marginLeft: "0.5rem" }}>
                      (Expected {total}, got {items.length})
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {loading ? (
            <div
              style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}
            >
              Loading items...
            </div>
          ) : filteredItems.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}
            >
              No items found
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {filteredItems.map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                      padding: "0.75rem",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      cursor: "pointer",
                      backgroundColor: selectedIds.includes(item.id)
                        ? "#eff6ff"
                        : "white",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedIds.includes(item.id)) {
                        e.currentTarget.style.backgroundColor = "#f9fafb";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectedIds.includes(item.id)) {
                        e.currentTarget.style.backgroundColor = "white";
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => handleToggleItem(item.id)}
                      style={{
                        width: "1rem",
                        height: "1rem",
                        cursor: "pointer",
                        marginTop: "0.125rem",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: "500",
                          color: "#111827",
                          fontSize: "0.875rem",
                          marginBottom: "0.25rem",
                        }}
                      >
                        ID: {item.id} - {getItemDisplayText(item)}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#6b7280",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getItemPreview(item)}
                      </div>

                      {/* Item Dependencies Note */}
                      {(() => {
                        const deps = getItemDependencies(item);
                        if (deps.length > 0) {
                          return (
                            <div
                              style={{
                                marginTop: "0.5rem",
                                padding: "0.375rem 0.5rem",
                                backgroundColor: "#fef3c7",
                                borderLeft: "3px solid #f59e0b",
                                borderRadius: "4px",
                                fontSize: "0.7rem",
                                color: "#92400e",
                              }}
                            >
                              <strong>⚠️ Needs:</strong>{" "}
                              {deps.map((dep, idx) => (
                                <span key={idx}>
                                  {dep.collection} (ID: {dep.value})
                                  {idx < deps.length - 1 ? ", " : ""}
                                </span>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </label>
                ))}
              </div>

              {/* Load More Button - Only show when NOT searching */}
              {!searchTerm && hasMore && (
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "1rem",
                    textAlign: "center",
                    backgroundColor: "#eff6ff",
                    borderRadius: "8px",
                    border: "2px dashed #3b82f6",
                  }}
                >
                  <div
                    style={{
                      marginBottom: "0.5rem",
                      fontSize: "0.875rem",
                      color: "#1e40af",
                      fontWeight: "500",
                    }}
                  >
                    {total - items.length} more items available
                  </div>
                  <button
                    onClick={onLoadMore}
                    style={{
                      backgroundColor: "#3b82f6",
                      color: "white",
                      padding: "0.625rem 1.5rem",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    📥 Load More Items (Next 100)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
            {selectedIds.length} item(s) selected
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={onClose}
              style={{
                backgroundColor: "#f3f4f6",
                color: "#374151",
                padding: "0.625rem 1.25rem",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: "500",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                console.log("Selected fields:", selectedFields);
                onImport(
                  selectedFields.length > 0 ? selectedFields : undefined
                );
              }}
              disabled={selectedIds.length === 0}
              style={{
                backgroundColor:
                  selectedIds.length === 0 ? "#9ca3af" : "#3b82f6",
                color: "white",
                padding: "0.625rem 1.25rem",
                border: "none",
                borderRadius: "6px",
                cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
                fontSize: "0.875rem",
                fontWeight: "500",
                opacity: selectedIds.length === 0 ? 0.6 : 1,
              }}
            >
              Import Selected ({selectedIds.length})
              {selectedFields.length > 0 &&
                ` - ${selectedFields.length} fields`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
