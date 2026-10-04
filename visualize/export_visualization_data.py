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

from collections import defaultdict
from FCA import ConceptBuilder
from AFCMiner import FairnessFilter, WFC_FairnessFilter, AttributedConceptsDerivation

def extract_maximal_clique_derivations(V, node_attribute_set, R, k=1, delta=10):
    attributes = set(node_attribute_set) - set(V)
    Matrix = defaultdict(lambda: defaultdict(int))
    for v in V:
        Matrix[v][v] = 1
    for i, j in R:
        Matrix[i][j] = 1
        if j in V:
            Matrix[j][i] = 1

    concepts = ConceptBuilder(Matrix, V, node_attribute_set)
    maximal_cliques = []
    seen_mc = set()

    for X1, X2, B in concepts:
        if X1 == X2:
            fs_mc = frozenset(X1)
            if fs_mc in seen_mc:
                continue
            seen_mc.add(fs_mc)

            c_nodes = sorted(list(X1))
            if len(c_nodes) < 2:
                continue

            # 1. AFC processing
            afc_derived = []
            if FairnessFilter(X1, X1, attributes, Matrix):
                afc_derived.append({
                    "nodes": c_nodes,
                    "pruned_nodes": []
                })
                is_afc_already = True
            else:
                is_afc_already = False
                powerset = AttributedConceptsDerivation(X1)
                powerset.sort(key=lambda x: len(x), reverse=True)
                cur_maxi = []
                for sub in powerset:
                    if not sub:
                        continue
                    flag = False
                    for cur in cur_maxi:
                        if (cur & sub) == sub:
                            flag = True
                            break
                    if flag:
                        continue
                    if FairnessFilter(sub, sub, attributes, Matrix):
                        cur_maxi.append(sub)
                        sub_nodes = sorted(list(sub))
                        pruned = sorted(list(set(c_nodes) - set(sub_nodes)))
                        afc_derived.append({
                            "nodes": sub_nodes,
                            "pruned_nodes": pruned
                        })

            # 2. WFC processing
            wfc_derived = []
            if WFC_FairnessFilter(X1, attributes, Matrix, k=k, delta=delta):
                wfc_derived.append({
                    "nodes": c_nodes,
                    "pruned_nodes": []
                })
                is_wfc_already = True
            else:
                is_wfc_already = False
                powerset = AttributedConceptsDerivation(X1)
                powerset.sort(key=lambda x: len(x), reverse=True)
                cur_maxi = []
                for sub in powerset:
                    if not sub:
                        continue
                    flag = False
                    for cur in cur_maxi:
                        if (cur & sub) == sub:
                            flag = True
                            break
                    if flag:
                        continue
                    if WFC_FairnessFilter(sub, attributes, Matrix, k=k, delta=delta):
                        cur_maxi.append(sub)
                        sub_nodes = sorted(list(sub))
                        pruned = sorted(list(set(c_nodes) - set(sub_nodes)))
                        wfc_derived.append({
                            "nodes": sub_nodes,
                            "pruned_nodes": pruned
                        })

            # Only include maximal cliques that formed at least one AFC or WFC
            if len(afc_derived) > 0 or len(wfc_derived) > 0:
                maximal_cliques.append({
                    "nodes": c_nodes,
                    "is_afc_already": is_afc_already,
                    "afc_derived": afc_derived,
                    "is_wfc_already": is_wfc_already,
                    "wfc_derived": wfc_derived
                })

    # Sort maximal cliques by size descending, then by node IDs
    maximal_cliques.sort(key=lambda x: (-len(x["nodes"]), x["nodes"]))
    return maximal_cliques

def build_visualization_payload():
    dataset_dir = os.path.join(BASE_DIR, DATASET_FOLDER)
    file_path = os.path.join(dataset_dir, DATASET_FILE)
    mat_data = scipy.io.loadmat(file_path)
    local_info = mat_data["local_info"]

    data_payload = {
        "meta": {
            "title": "Absolute Fair Clique (AFC) vs Weak Fair Clique (WFC) Derivation Visualizer",
            "k": 1,
            "delta": 2,
            "dataset": DATASET_FILE
        },
        "subsets": {}
    }

    print("Pre-generating subsets and mining maximal cliques + derivations...")
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

        # Mine maximal cliques with AFC / WFC derivations
        mc_raw_list = extract_maximal_clique_derivations(nodes, attribute_columns, combined_data, k=1, delta=10)

        # Calculate degrees
        degrees = {n: 0 for n in nodes}
        for u, v in edges:
            degrees[u] += 1
            degrees[v] += 1

        # Format nodes lookup dictionary
        nodes_lookup = {}
        for n in nodes:
            raw_idx = int(n[1:])
            status_val = "undergrad" if local_info[raw_idx, 0] == 1 else "other"
            raw_gender = "female" if local_info[raw_idx, 1] == 1 else "male"
            raw_year = int(local_info[raw_idx, 5]) if local_info[raw_idx, 5] > 0 else "unknown"
            
            attr_pair = node_attributes.get(n, (raw_gender, "fresh_soph"))
            gender_attr = attr_pair[0]
            year_attr = attr_pair[1]
            combined_attr = f"{gender_attr} | {year_attr}"

            nodes_lookup[n] = {
                "id": n,
                "label": f"User {n}",
                "gender": gender_attr,
                "year_group": year_attr,
                "attribute": combined_attr,
                "raw_year": raw_year,
                "status": status_val,
                "degree": degrees[n]
            }

        # Format maximal clique objects with detailed breakdowns
        formatted_maximal_cliques = []
        for i, mc in enumerate(mc_raw_list, start=1):
            c_nodes = mc["nodes"]

            # Compute demographic counts helper
            def get_counts(n_list):
                g_cnt = {"female": 0, "male": 0}
                attr_cnt = {}
                for nid in n_list:
                    g = nodes_lookup[nid]["gender"]
                    g_cnt[g] = g_cnt.get(g, 0) + 1
                    comb = nodes_lookup[nid]["attribute"]
                    attr_cnt[comb] = attr_cnt.get(comb, 0) + 1
                return g_cnt, attr_cnt

            mc_g_cnt, mc_attr_cnt = get_counts(c_nodes)

            # Format AFC derivations
            afc_formatted_derived = []
            for d_idx, d_item in enumerate(mc["afc_derived"], start=1):
                d_g_cnt, d_attr_cnt = get_counts(d_item["nodes"])
                afc_formatted_derived.append({
                    "id": f"AFC-sub-{d_idx}",
                    "size": len(d_item["nodes"]),
                    "nodes": d_item["nodes"],
                    "pruned_nodes": d_item["pruned_nodes"],
                    "gender_counts": d_g_cnt,
                    "attribute_counts": d_attr_cnt
                })

            # Format WFC derivations
            wfc_formatted_derived = []
            for d_idx, d_item in enumerate(mc["wfc_derived"], start=1):
                d_g_cnt, d_attr_cnt = get_counts(d_item["nodes"])
                wfc_formatted_derived.append({
                    "id": f"WFC-sub-{d_idx}",
                    "size": len(d_item["nodes"]),
                    "nodes": d_item["nodes"],
                    "pruned_nodes": d_item["pruned_nodes"],
                    "gender_counts": d_g_cnt,
                    "attribute_counts": d_attr_cnt
                })

            formatted_maximal_cliques.append({
                "id": f"MC-{i}",
                "name": f"Maximal Clique #{i} ({len(c_nodes)} Nodes)",
                "index": i,
                "size": len(c_nodes),
                "nodes": c_nodes,
                "gender_counts": mc_g_cnt,
                "attribute_counts": mc_attr_cnt,
                "afc": {
                    "is_already_fair": mc["is_afc_already"],
                    "derived_cliques": afc_formatted_derived
                },
                "wfc": {
                    "is_already_fair": mc["is_wfc_already"],
                    "derived_cliques": wfc_formatted_derived
                }
            })

        data_payload["subsets"][str(idx)] = {
            "subset_index": idx,
            "target_nodes": size,
            "name": f"SubSet {idx} ({size} Nodes)",
            "node_count": len(nodes),
            "edge_count": len(edges),
            "nodes_lookup": nodes_lookup,
            "maximal_cliques": formatted_maximal_cliques,
            "stats": {
                "total_maximal_cliques": len(formatted_maximal_cliques),
                "max_clique_size": formatted_maximal_cliques[0]["size"] if formatted_maximal_cliques else 0
            }
        }
        print(f"SubSet {idx}: {len(formatted_maximal_cliques)} Maximal Cliques extracted")

    # Save as JSON file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(script_dir, "network_data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data_payload, f, indent=2)
    print(f"\nSaved {json_path} (size: {os.path.getsize(json_path):,} bytes)")

    # Also save as network_data.js so index.html works directly without CORS issues
    js_path = os.path.join(script_dir, "network_data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.GRAPH_DATA = ")
        json.dump(data_payload, f)
        f.write(";\n")
    print(f"Saved {js_path} (size: {os.path.getsize(js_path):,} bytes)")

if __name__ == "__main__":
    build_visualization_payload()

