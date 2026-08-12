import os
from collections import Counter, defaultdict
from main import afc_miner  


def load_lastfm_data(data_dir=".", top_k_tags=3):
    """
    Parses HetRec 2011 Last.fm dataset and builds inputs for AFCMiner.
    
    Files expected in data_dir:
      - user_friends.dat  (userID \t friendID)
      - user_taggedartists.dat (userID \t artistID \t tagID \t timestamp)
      - tags.dat (tagID \t tagValue)
    """
    friends_file = os.path.join(data_dir, "user_friends.dat")
    tagged_file = os.path.join(data_dir, "user_taggedartists.dat")
    tags_file = os.path.join(data_dir, "tags.dat")

    # ---------------------------------------------------------
    # STEP 1: Load Tag Names
    # ---------------------------------------------------------
    tag_names = {}
    if os.path.exists(tags_file):
        with open(tags_file, "r", encoding="utf-8", errors="ignore") as f:
            next(f)  # Skip header (tagID \t tagValue)
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) >= 2:
                    tag_id = parts[0]
                    tag_name = parts[1]
                    tag_names[tag_id] = tag_name

    # ---------------------------------------------------------
    # STEP 2: Find Top-K Most Frequent Tags Dataset-Wide
    # ---------------------------------------------------------
    tag_counts = Counter()
    user_tag_counts = defaultdict(Counter)

    with open(tagged_file, "r", encoding="utf-8", errors="ignore") as f:
        next(f)  # Skip header (userID \t artistID \t tagID \t day \t month \t year)
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 3:
                user_id = parts[0]
                tag_id = parts[2]
                tag_counts[tag_id] += 1
                user_tag_counts[user_id][tag_id] += 1

    # Keep only top-K overall tags
    top_tag_ids = set([tag_id for tag_id, _ in tag_counts.most_common(top_k_tags)])
    print(f"Top {top_k_tags} Selected Tags:")
    for tid in top_tag_ids:
        print(f"  - Tag ID {tid}: {tag_names.get(tid, 'Unknown')}")

    # ---------------------------------------------------------
    # STEP 3: Assign Dominant Top Tag as Node Attribute
    # ---------------------------------------------------------
    node_attributes = {}
    for user_id, user_tags in user_tag_counts.items():
        # Filter user tags to only those in the top_k_tags
        filtered = {tid: count for tid, count in user_tags.items() if tid in top_tag_ids}
        if filtered:
            # Pick dominant tag name
            dominant_tag_id = max(filtered, key=filtered.get)
            node_attributes[user_id] = tag_names.get(dominant_tag_id, dominant_tag_id)

    valid_users = set(node_attributes.keys())

    # ---------------------------------------------------------
    # STEP 4: Load Mutual Friendships (Edges)
    # ---------------------------------------------------------
    raw_edges = set()
    with open(friends_file, "r", encoding="utf-8", errors="ignore") as f:
        next(f)  # Skip header (userID \t friendID)
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 2:
                u, v = parts[0], parts[1]
                # Only keep edges if both nodes have an assigned attribute
                if u in valid_users and v in valid_users:
                    edge = tuple(sorted([u, v]))
                    raw_edges.add(edge)

    edges = list(raw_edges)
    nodes = list(valid_users)

    print(f"\nFiltered Graph Built:")
    print(f"  - Total Users (Nodes): {len(nodes)}")
    print(f"  - Total Friendship Links (Edges): {len(edges)}")

    return nodes, edges, node_attributes


# ---------------------------------------------------------
# STEP 5: Run AFCMiner on Prepared Data
# ---------------------------------------------------------
if __name__ == "__main__":
    # Load Last.fm dataset looking at Top-3 tag categories
    nodes, edges, node_attributes = load_lastfm_data(data_dir=".", top_k_tags=3)

    print("\nRunning AFCMiner on Last.fm Dataset...")
    afmc, afc = afc_miner(nodes, edges, node_attributes)

    print(f"\nResults:")
    print(f"  - Absolute Fair Maximal Cliques Found: {len(afmc)}")
    print(f"  - Total Absolute Fair Cliques Found: {len(afc)}")

    if afmc:
        print("\nSample Absolute Fair Maximal Clique:")
        sample = list(afmc)[0]
        print(" ", sample)
        print("  Node breakdown:")
        for node in sample:
            print(f"    User {node} -> Tag: {node_attributes[node]}")