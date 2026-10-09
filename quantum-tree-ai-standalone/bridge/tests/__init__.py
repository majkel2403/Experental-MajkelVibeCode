"""E2E testy mostu MCP <-> karta Jarvis OS (unittest, stdlib + requests).

Nie mockujemy mostu ani przeglądarki — każdy test uderza w prawdziwy
proces :8651 i prawdziwą kartę na :4000 (chyba że test celowo weryfikuje
OFFLINE — wtedy stawiamy izolowany most :18652 bez klienta SSE).
"""
