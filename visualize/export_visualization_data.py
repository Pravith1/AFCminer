import json
import os
import sys
import scipy.io
import networkx as nx

# Add parent project root to sys.path so modules can be imported
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from experiment_utils import SUBSET_SIZES, DATASET_FILE, DATASET_FOLDER
from sparse_preprocess import load_facebook100_data, split_preprocessed_data
from AFCMiner import AFCMiner

def build_visualization_payload():
    dataset_dir = os.path.join(BASE_DIR, DATASET_FOLDER)
    file_path = os.path.join(dataset_dir, DATASET_FILE)
    mat_data = scipy.io.loadmat(file_path)
    local_info = mat_data["local_info"]

    data_payload = {
        "meta": {
            "title": "Absolute Fair Clique (AFC) vs Weak Fair Clique (WFC) Visualizer",
            "k": 1,
            "delta": 10,
            "dataset": DATASET_FILE
        },
        "subsets": {}
    }

    print("Pre-generating subsets and mining cliques...")
    for idx, size in enumerate(SUBSET_SIZES, start=1):
        print(f"\n--- Processing SubSet {idx} ({size} nodes) ---")
        nodes, attribute_columns, combined_data = load_facebook100_data(
            mat_filename=DATASET_FILE,
            folder_name=dataset_dir,
            max_nodes=size,
            attribute_type="multidim_gender_year",
            granularity=2
        )
        edges, node_attributes = split_preprocessed_data(nodes, combined_data)

        # Run AFCMiner to get both AFC and WFC
        afc_out = AFCMiner(nodes, attribute_columns, combined_data, k=1, delta=10)
        afc_list, wfc_list, afc_max, wfc_max, count_afc, count_wfc = afc_out

        # Standardize cliques to sorted lists of node IDs
        # To avoid duplicates if any, convert to set of frozensets
        unique_afc_sets = []
        seen_afc = set()
        for c in afc_list:
            fs = frozenset(c)
            if fs not in seen_afc:
                seen_afc.add(fs)
                unique_afc_sets.append(sorted(list(fs)))

        unique_wfc_sets = []
        seen_wfc = set()
        for c in wfc_list:
            fs = frozenset(c)
            if fs not in seen_wfc:
                seen_wfc.add(fs)
                unique_wfc_sets.append(sorted(list(fs)))

        # Sort cliques by size descending, then by node IDs
        unique_afc_sets.sort(key=lambda x: (-len(x), x))
        unique_wfc_sets.sort(key=lambda x: (-len(x), x))

        afc_set_lookup = {frozenset(c) for c in unique_afc_sets}
        wfc_set_lookup = {frozenset(c) for c in unique_wfc_sets}

        # Calculate degrees
        degrees = {n: 0 for n in nodes}
        for u, v in edges:
            degrees[u] += 1
            degrees[v] += 1

        # Format nodes
        formatted_nodes = []
        for n in nodes:
            # extract raw index from 'v1234'
            raw_idx = int(n[1:])
            # local_info: 0: status, 1: gender, 2: major, 4: dorm, 5: year
            status_val = "undergrad" if local_info[raw_idx, 0] == 1 else "other"
            raw_gender = "female" if local_info[raw_idx, 1] == 1 else "male"
            raw_year = int(local_info[raw_idx, 5]) if local_info[raw_idx, 5] > 0 else "unknown"
            
            # multidim attribute from node_attributes
            attr_pair = node_attributes.get(n, (raw_gender, "fresh_soph"))
            gender_attr = attr_pair[0]
            year_attr = attr_pair[1]
            combined_attr = f"{gender_attr} | {year_attr}"

            formatted_nodes.append({
                "id": n,
                "label": f"User {n}",
                "gender": gender_attr,
                "year_group": year_attr,
                "attribute": combined_attr,
                "raw_year": raw_year,
                "status": status_val,
                "degree": degrees[n]
            })

        # Format links
        formatted_links = [{"source": u, "target": v} for u, v in edges]

        # Helper to format clique objects
        def format_cliques(clique_list, clique_type):
            res = []
            for i, c_nodes in enumerate(clique_list, start=1):
                c_set = frozenset(c_nodes)
                is_both = (c_set in afc_set_lookup) and (c_set in wfc_set_lookup)
                
                # Attribute and demographic breakdown
                g_counts = {"female": 0, "male": 0}
                attr_counts = {}
                for node_id in c_nodes:
                    pair = node_attributes.get(node_id, ("unknown", "unknown"))
                    g_counts[pair[0]] = g_counts.get(pair[0], 0) + 1
                    comb = f"{pair[0]} | {pair[1]}"
                    attr_counts[comb] = attr_counts.get(comb, 0) + 1

                res.append({
                    "id": f"{clique_type}-{i}",
                    "type": clique_type,
                    "index": i,
                    "size": len(c_nodes),
                    "nodes": c_nodes,
                    "gender_counts": g_counts,
                    "attribute_counts": attr_counts,
                    "is_also_other": is_both
                })
            return res

        afc_formatted = format_cliques(unique_afc_sets, "AFC")
        wfc_formatted = format_cliques(unique_wfc_sets, "WFC")

        data_payload["subsets"][str(idx)] = {
            "subset_index": idx,
            "target_nodes": size,
            "name": f"SubSet {idx} ({size} Nodes)",
            "node_count": len(nodes),
            "edge_count": len(edges),
            "nodes": formatted_nodes,
            "links": formatted_links,
            "afc_cliques": afc_formatted,
            "wfc_cliques": wfc_formatted,
            "stats": {
                "total_afc": len(afc_formatted),
                "total_wfc": len(wfc_formatted),
                "max_afc_size": afc_max,
                "max_wfc_size": wfc_max,
                "overlapping_cliques": len(afc_set_lookup & wfc_set_lookup)
            }
        }
        print(f"SubSet {idx}: {len(afc_formatted)} AFCs, {len(wfc_formatted)} WFCs, {len(afc_set_lookup & wfc_set_lookup)} overlap")

    # Save as JSON file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(script_dir, "network_data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data_payload, f, indent=2)
    print(f"\nSaved {json_path} (size: {os.path.getsize(json_path):,} bytes)")

    # Also save as data.js so index.html works directly with file:/// without CORS issues
    js_path = os.path.join(script_dir, "network_data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.GRAPH_DATA = ")
        json.dump(data_payload, f)
        f.write(";\n")
    print(f"Saved {js_path} (size: {os.path.getsize(js_path):,} bytes)")

if __name__ == "__main__":
    build_visualization_payload()
