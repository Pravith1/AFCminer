import itertools

# ==========================================
# 1. FORMAL CONTEXT CONSTRUCTION (Definition 5)
# ==========================================
def build_formal_context(nodes, edges, node_attributes):
    """
    Constructs the Incidence Matrix M = [M_adj | M_att] as a formal context.
    
    Parameters:
      - nodes: list of node IDs [v1, v2, ...]
      - edges: list of tuples [(u, v), ...]
      - node_attributes: dict mapping node_id -> attribute_value
    """
    # Create adjacency lookup table (M_adj with self-loops)
    adj = {v: set([v]) for v in nodes}
    for u, v in edges:
        adj[u].add(v)
        adj[v].add(u)
        
    # Get all unique attribute categories (A_val)
    a_val = sorted(list(set(node_attributes.values())))
    
    return adj, node_attributes, a_val


# ==========================================
# 2. ALGORITHM 2: FAIRNESS FILTER ALGORITHM
# ==========================================
def fairness_filter(clique, node_attributes, a_val):
    """
    Determines whether a candidate clique satisfies Absolute Fairness.
    
    Theorem 2 Condition:
      1. |clique| MOD |A_val| == 0
      2. Tally for each attribute category in a_val must be strictly equal.
    """
    num_attributes = len(a_val)
    
    # 1. Quick Modulo Check (Theorem 2)
    if len(clique) == 0 or len(clique) % num_attributes != 0:
        return False
        
    # 2. Count node occurrences for each attribute category
    counts = {attr: 0 for attr in a_val}
    for node in clique:
        attr = node_attributes[node]
        counts[attr] += 1
        
    # 3. Verify equality across all category counts
    first_count = list(counts.values())[0]
    if first_count == 0:
        return False
        
    return all(count == first_count for count in counts.values())


# ==========================================
# 3. ALGORITHM 3: ATTRIBUTED CONCEPTS DERIVATION
# ==========================================
def attributed_concepts_derivation(maximal_clique):
    """
    Calculates the power set P(X1) of a maximal clique to derive sub-cliques.
    (Lemma 1: Absolute fair sub-cliques are hidden in the power set).
    """
    clique_list = list(maximal_clique)
    sub_cliques = []
    
    # Generate all subsets from size 1 up to len(maximal_clique)-1
    for r in range(1, len(clique_list)):
        for combo in itertools.combinations(clique_list, r):
            sub_cliques.append(set(combo))
            
    return sub_cliques


# ==========================================
# 4. EQUICONCEPT / MAXIMAL CLIQUE EXTRACTION
# ==========================================
def extract_attributed_equiconcepts_bitwise(nodes, edges, node_attributes):
    """
    Fast FCA Equiconcept Extraction using Bitwise Operations
    """
    n = len(nodes)
    node_to_idx = {node: i for i, node in enumerate(nodes)}
    idx_to_node = {i: node for i, node in enumerate(nodes)}

    # 1. Represent Adjacency Matrix as Bit Vectors (Integers)
    # Each row is an integer where bit 'j' is 1 if (v_i, v_j) in E or i == j
    adj_bits = [(1 << i) for i in range(n)]  # Initialize with self-loops
    for u, v in edges:
        if u in node_to_idx and v in node_to_idx:
            u_idx = node_to_idx[u]
            v_idx = node_to_idx[v]
            adj_bits[u_idx] |= (1 << v_idx)
            adj_bits[v_idx] |= (1 << u_idx)

    equiconcepts = []
    processed_extents = set()

    # Full bitmask containing 1s for all nodes
    ALL_NODES_MASK = (1 << n) - 1

    def derive_intent_bit(extent_mask):
        """Find common neighbors using Bitwise AND across all nodes in extent_mask"""
        intent_mask = ALL_NODES_MASK
        for i in range(n):
            if (extent_mask >> i) & 1:
                intent_mask &= adj_bits[i]
        return intent_mask

    def derive_extent_bit(intent_mask):
        """Find nodes connected to all nodes in intent_mask using Bitwise AND"""
        extent_mask = ALL_NODES_MASK
        for i in range(n):
            if (intent_mask >> i) & 1:
                extent_mask &= adj_bits[i]
        return extent_mask

    # 2. Iterate and Compute Closures using Bitwise Operations
    for i in range(n):
        initial_extent_mask = adj_bits[i]

        # Compute closure: (Extent'') via Bitwise AND
        intent_mask = derive_intent_bit(initial_extent_mask)
        extent_mask = derive_extent_bit(intent_mask)

        # Equiconcept Check: Extent == Intent (Bitwise Equality)
        if extent_mask == intent_mask:
            if extent_mask not in processed_extents:
                processed_extents.add(extent_mask)

                # Convert bitmask back to node list for AFCMiner
                clique_nodes = [idx_to_node[j] for j in range(n) if (extent_mask >> j) & 1]
                clique_set = set(clique_nodes)
                
                # Attribute Information B = X1^U
                b_info = {node: node_attributes[node] for node in clique_nodes}
                
                equiconcepts.append((clique_set,b_info))

    return equiconcepts


# ==========================================
# 5. ALGORITHM 1: AFC MINER (MAIN ALGORITHM)
# ==========================================
def afc_miner(nodes, edges, node_attributes):
    """
    Main pipeline for finding Absolute Fair Maximal Cliques (AFMC)
    and all Absolute Fair Cliques (AFC).
    """
    # Output set of Absolute Fair Cliques
    zeta_afc = set()
    zeta_afmc = set()
    
    # Step 1 & 2: Construct Formal Context & Matrix
    adj, node_attributes, a_val = build_formal_context(nodes, edges, node_attributes)
    
    # Step 3 & 4: Extract Equiconcepts (Maximal Cliques)
    equiconcepts = extract_attributed_equiconcepts_bitwise(nodes, edges, node_attributes)
    
    # Step 6-14: Iterate through concepts and apply filters
    for X1, B in equiconcepts:
        # Check if it is a Maximal Clique
            # Call Algorithm 2: Fairness Filter
        if fairness_filter(X1, node_attributes, a_val):
            clique_frozen = tuple(sorted(list(X1)))
            zeta_afmc.add(clique_frozen)
            zeta_afc.add(clique_frozen)
        else:
            # Call Algorithm 3: Derive sub-cliques via Power Set P(X1)
            sub_cliques = attributed_concepts_derivation(X1)
            for sub_c in sub_cliques:
                if fairness_filter(sub_c, node_attributes, a_val):
                    zeta_afc.add(tuple(sorted(list(sub_c))))
                        
    return zeta_afmc, zeta_afc


# ==========================================
# TEST WITH PAPER'S EXAMPLE (Fig 1 & Example 1)
# ==========================================
if __name__ == "__main__":
    # 8 Nodes: v1..v7 (v1-v7 form connected core, v8 is isolated leaf)
    nodes = [f"v{i}" for i in range(1, 9)]
    
    # Attributes: M (Male) and F (Female)
    node_attributes = {
        'v1': 'M', 'v2': 'M', 'v3': 'M', 'v7': 'M',
        'v4': 'F', 'v5': 'F', 'v6': 'F', 'v8': 'F'
    }
    
    # Edges from Figure 1(a) in the paper
    edges = [
        ('v1', 'v2'), ('v1', 'v3'), ('v1', 'v4'), ('v1', 'v5'), ('v1', 'v6'), ('v1', 'v7'), ('v1', 'v8'),
        ('v2', 'v3'), ('v2', 'v4'), ('v2', 'v5'), ('v2', 'v6'), ('v2', 'v7'),
        ('v3', 'v4'), ('v3', 'v5'), ('v3', 'v6'), ('v3', 'v7'),
        ('v4', 'v5'), ('v4', 'v6'), ('v4', 'v7'),
        ('v5', 'v6'), ('v5', 'v7'),
        ('v6', 'v7')
    ]
    
    afmc, afc = afc_miner(nodes, edges, node_attributes)
    
    print(f"Absolute Fair Maximal Cliques Found ({len(afmc)}):")
    for c in afmc:
        print(" ", c)
        
    print(f"\nAll Absolute Fair Sub-Cliques Found ({len(afc)}):")
    for c in sorted(afc):
        print(" ", c)