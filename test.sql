EXPLAIN (ANALYZE, BUFFERS)
WITH max AS (
    SELECT t.team_number,
           max(t.opr_total_points_np)   AS tot,
           max(t.opr_auto_points)       AS auto,
           max(t.opr_dc_points)         AS dc,
           max(t.opr_dc_park_points)    AS eg
    FROM   tep_2024 t
               JOIN   event e
                      ON e.season = t.season AND e.code = t.event_code
    WHERE  NOT t.is_remote
      AND  t.has_stats
      AND  NOT e.modified_rules
    GROUP  BY t.team_number
),
     ranks AS (
         SELECT *,
                rank() OVER (ORDER BY tot DESC) AS tot_rank,
                rank() OVER (ORDER BY auto DESC) AS auto_rank,
                rank() OVER (ORDER BY dc  DESC) AS dc_rank,
                rank() OVER (ORDER BY eg  DESC) AS eg_rank
         FROM max
     )
SELECT *
FROM   ranks WHERE team_number = 19444;