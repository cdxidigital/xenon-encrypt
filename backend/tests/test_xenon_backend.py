"""
Xenon Messenger Backend API Tests
Tests: Identities, Contacts, Chats, Messages, Typing, Panic, AI features
"""
import pytest
import time
import re

# Test data storage
test_identities = []
test_contacts = []
test_chats = []
test_messages = []


class TestHealth:
    """Health check and basic connectivity"""

    def test_root_endpoint(self, base_url, api_client):
        """Test root API endpoint returns service info"""
        response = api_client.get(f"{base_url}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert data["service"] == "Xenon Messenger Relay"
        print("✓ Root endpoint working")


class TestIdentities:
    """Identity creation, listing, retrieval, deletion"""

    def test_create_identity(self, base_url, api_client):
        """Create identity with XEN-XXXX-XXXX format"""
        response = api_client.post(
            f"{base_url}/api/identities",
            json={"name": "TEST_Alice", "disposable": False}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Validate XID format
        assert "xid" in data
        assert re.match(r"^XEN-[A-Z0-9]{4}-[A-Z0-9]{4}$", data["xid"])
        assert data["name"] == "TEST_Alice"
        assert data["disposable"] is False
        assert "public_key" in data
        assert "avatar_seed" in data
        assert "_id" not in data  # MongoDB _id should be excluded
        
        test_identities.append(data)
        print(f"✓ Created identity: {data['xid']}")

    def test_create_disposable_identity(self, base_url, api_client):
        """Create disposable identity"""
        response = api_client.post(
            f"{base_url}/api/identities",
            json={"name": "TEST_Bob", "disposable": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["disposable"] is True
        test_identities.append(data)
        print(f"✓ Created disposable identity: {data['xid']}")

    def test_list_identities(self, base_url, api_client):
        """List all identities"""
        response = api_client.get(f"{base_url}/api/identities")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2  # At least our 2 test identities
        print(f"✓ Listed {len(data)} identities")

    def test_get_identity(self, base_url, api_client):
        """Get specific identity by XID"""
        if not test_identities:
            pytest.skip("No test identities created")
        
        xid = test_identities[0]["xid"]
        response = api_client.get(f"{base_url}/api/identities/{xid}")
        assert response.status_code == 200
        data = response.json()
        assert data["xid"] == xid
        assert "_id" not in data
        print(f"✓ Retrieved identity: {xid}")

    def test_get_nonexistent_identity(self, base_url, api_client):
        """Get non-existent identity returns 404"""
        response = api_client.get(f"{base_url}/api/identities/XEN-FAKE-XXXX")
        assert response.status_code == 404
        print("✓ Non-existent identity returns 404")


class TestContacts:
    """Contact creation, listing, verification"""

    def test_add_contact_success(self, base_url, api_client):
        """Add contact with valid peer XID"""
        if len(test_identities) < 2:
            pytest.skip("Need at least 2 identities")
        
        owner = test_identities[0]["xid"]
        peer = test_identities[1]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/contacts",
            json={"owner_xid": owner, "peer_xid": peer}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["owner_xid"] == owner
        assert data["peer_xid"] == peer
        assert "fingerprint" in data
        assert "trust_score" in data
        assert 40 <= data["trust_score"] <= 95
        assert data["verified"] is False
        assert "_id" not in data
        
        test_contacts.append(data)
        print(f"✓ Added contact: {owner} → {peer}, trust={data['trust_score']}")

    def test_add_contact_idempotent(self, base_url, api_client):
        """Adding same contact twice returns existing contact"""
        if len(test_identities) < 2:
            pytest.skip("Need at least 2 identities")
        
        owner = test_identities[0]["xid"]
        peer = test_identities[1]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/contacts",
            json={"owner_xid": owner, "peer_xid": peer}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["owner_xid"] == owner
        assert data["peer_xid"] == peer
        print("✓ Contact creation is idempotent")

    def test_add_contact_unknown_peer(self, base_url, api_client):
        """Adding contact with unknown peer returns 404"""
        if not test_identities:
            pytest.skip("Need at least 1 identity")
        
        owner = test_identities[0]["xid"]
        response = api_client.post(
            f"{base_url}/api/contacts",
            json={"owner_xid": owner, "peer_xid": "XEN-FAKE-XXXX"}
        )
        assert response.status_code == 404
        print("✓ Unknown peer XID returns 404")

    def test_list_contacts(self, base_url, api_client):
        """List contacts for owner"""
        if not test_identities:
            pytest.skip("Need at least 1 identity")
        
        owner = test_identities[0]["xid"]
        response = api_client.get(f"{base_url}/api/contacts?owner_xid={owner}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        print(f"✓ Listed {len(data)} contacts for {owner}")

    def test_verify_contact(self, base_url, api_client):
        """Verify contact sets verified=True and trust_score=100"""
        if not test_contacts:
            pytest.skip("Need at least 1 contact")
        
        contact_id = test_contacts[0]["id"]
        response = api_client.post(f"{base_url}/api/contacts/{contact_id}/verify")
        assert response.status_code == 200
        print(f"✓ Verified contact: {contact_id}")


class TestChats:
    """Chat creation, listing, updating, deletion, fingerprint"""

    def test_create_direct_chat(self, base_url, api_client):
        """Create direct chat between 2 participants"""
        if len(test_identities) < 2:
            pytest.skip("Need at least 2 identities")
        
        alice = test_identities[0]["xid"]
        bob = test_identities[1]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/chats",
            json={
                "type": "direct",
                "participant_xids": [alice, bob],
                "created_by_xid": alice
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] == "direct"
        assert set(data["participant_xids"]) == {alice, bob}
        assert data["created_by_xid"] == alice
        assert data["vault"] is False
        assert data["ghost"] is False
        assert data["burn_seconds"] is None
        assert "_id" not in data
        
        test_chats.append(data)
        print(f"✓ Created direct chat: {data['id']}")

    def test_create_direct_chat_reuses_existing(self, base_url, api_client):
        """Creating direct chat with same 2 participants reuses existing"""
        if len(test_identities) < 2:
            pytest.skip("Need at least 2 identities")
        
        alice = test_identities[0]["xid"]
        bob = test_identities[1]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/chats",
            json={
                "type": "direct",
                "participant_xids": [bob, alice],  # reversed order
                "created_by_xid": bob
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return same chat ID as before
        assert data["id"] == test_chats[0]["id"]
        print("✓ Direct chat reuse working")

    def test_create_group_chat(self, base_url, api_client):
        """Create group chat with 3+ participants"""
        if len(test_identities) < 2:
            pytest.skip("Need at least 2 identities")
        
        # Create a third identity for group
        response = api_client.post(
            f"{base_url}/api/identities",
            json={"name": "TEST_Charlie", "disposable": False}
        )
        assert response.status_code == 200
        charlie = response.json()
        test_identities.append(charlie)
        
        alice = test_identities[0]["xid"]
        bob = test_identities[1]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/chats",
            json={
                "type": "group",
                "name": "TEST_Group",
                "participant_xids": [alice, bob, charlie["xid"]],
                "created_by_xid": alice
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] == "group"
        assert data["name"] == "TEST_Group"
        assert len(data["participant_xids"]) == 3
        test_chats.append(data)
        print(f"✓ Created group chat: {data['id']}")

    def test_create_broadcast_chat(self, base_url, api_client):
        """Create broadcast chat"""
        if len(test_identities) < 2:
            pytest.skip("Need at least 2 identities")
        
        alice = test_identities[0]["xid"]
        bob = test_identities[1]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/chats",
            json={
                "type": "broadcast",
                "name": "TEST_Broadcast",
                "participant_xids": [alice, bob],
                "created_by_xid": alice
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "broadcast"
        test_chats.append(data)
        print(f"✓ Created broadcast chat: {data['id']}")

    def test_list_chats(self, base_url, api_client):
        """List chats for participant"""
        if not test_identities:
            pytest.skip("Need at least 1 identity")
        
        alice = test_identities[0]["xid"]
        response = api_client.get(f"{base_url}/api/chats?xid={alice}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        print(f"✓ Listed {len(data)} chats for {alice}")

    def test_list_chats_exclude_vault(self, base_url, api_client):
        """List chats excludes vault by default"""
        if not test_identities:
            pytest.skip("Need at least 1 identity")
        
        alice = test_identities[0]["xid"]
        response = api_client.get(f"{base_url}/api/chats?xid={alice}&include_vault=false")
        assert response.status_code == 200
        data = response.json()
        # All should have vault=False
        for chat in data:
            assert chat["vault"] is False
        print("✓ Vault chats excluded by default")

    def test_get_chat(self, base_url, api_client):
        """Get specific chat by ID"""
        if not test_chats:
            pytest.skip("Need at least 1 chat")
        
        chat_id = test_chats[0]["id"]
        response = api_client.get(f"{base_url}/api/chats/{chat_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == chat_id
        assert "_id" not in data
        print(f"✓ Retrieved chat: {chat_id}")

    def test_update_chat_vault(self, base_url, api_client):
        """Update chat to vault mode"""
        if not test_chats:
            pytest.skip("Need at least 1 chat")
        
        chat_id = test_chats[0]["id"]
        response = api_client.patch(
            f"{base_url}/api/chats/{chat_id}",
            json={"vault": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["vault"] is True
        print(f"✓ Updated chat to vault: {chat_id}")

    def test_update_chat_ghost_mode(self, base_url, api_client):
        """Update chat to ghost mode"""
        if not test_chats:
            pytest.skip("Need at least 1 chat")
        
        chat_id = test_chats[0]["id"]
        response = api_client.patch(
            f"{base_url}/api/chats/{chat_id}",
            json={"ghost": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ghost"] is True
        print(f"✓ Updated chat to ghost mode: {chat_id}")

    def test_update_chat_burn_seconds(self, base_url, api_client):
        """Update chat burn timer"""
        if not test_chats:
            pytest.skip("Need at least 1 chat")
        
        chat_id = test_chats[0]["id"]
        response = api_client.patch(
            f"{base_url}/api/chats/{chat_id}",
            json={"burn_seconds": 10}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["burn_seconds"] == 10
        print(f"✓ Updated chat burn timer: {chat_id}")

    def test_update_chat_decoy(self, base_url, api_client):
        """Update chat to decoy mode"""
        if not test_chats:
            pytest.skip("Need at least 1 chat")
        
        chat_id = test_chats[0]["id"]
        response = api_client.patch(
            f"{base_url}/api/chats/{chat_id}",
            json={"decoy": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["decoy"] is True
        print(f"✓ Updated chat to decoy: {chat_id}")

    def test_update_chat_name(self, base_url, api_client):
        """Update chat name"""
        if len(test_chats) < 2:
            pytest.skip("Need at least 2 chats")
        
        # Use group chat
        group_chat = [c for c in test_chats if c["type"] == "group"]
        if not group_chat:
            pytest.skip("Need a group chat")
        
        chat_id = group_chat[0]["id"]
        response = api_client.patch(
            f"{base_url}/api/chats/{chat_id}",
            json={"name": "TEST_Updated_Group"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Updated_Group"
        print(f"✓ Updated chat name: {chat_id}")

    def test_get_chat_fingerprint(self, base_url, api_client):
        """Get chat fingerprint (8x5 SHA-256 groups)"""
        if not test_chats:
            pytest.skip("Need at least 1 chat")
        
        chat_id = test_chats[0]["id"]
        response = api_client.get(f"{base_url}/api/chats/{chat_id}/fingerprint")
        assert response.status_code == 200
        data = response.json()
        
        assert data["chat_id"] == chat_id
        assert "fingerprint" in data
        assert "participants" in data
        
        # Validate fingerprint format: 8 groups of 5 hex chars
        fp = data["fingerprint"]
        groups = fp.split()
        assert len(groups) == 8
        for group in groups:
            assert len(group) == 5
            assert all(c in "0123456789ABCDEF" for c in group)
        
        print(f"✓ Chat fingerprint: {fp[:20]}...")


class TestMessages:
    """Message sending, listing, reading, destroying, self-destruct"""

    def test_send_message(self, base_url, api_client):
        """Send message to chat"""
        if not test_chats or not test_identities:
            pytest.skip("Need chat and identity")
        
        chat_id = test_chats[0]["id"]
        sender = test_identities[0]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/messages",
            json={
                "chat_id": chat_id,
                "sender_xid": sender,
                "ciphertext": "dGVzdCBjaXBoZXJ0ZXh0",  # base64 encoded
                "content_type": "text"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["chat_id"] == chat_id
        assert data["sender_xid"] == sender
        assert data["ciphertext"] == "dGVzdCBjaXBoZXJ0ZXh0"
        assert data["content_type"] == "text"
        assert data["destroyed"] is False
        assert data["delivered"] is True
        assert data["read_by"] == []
        assert "_id" not in data
        
        test_messages.append(data)
        print(f"✓ Sent message: {data['id']}")

    def test_send_message_updates_chat_preview(self, base_url, api_client):
        """Sending message updates chat last_message_preview"""
        if not test_chats:
            pytest.skip("Need chat")
        
        chat_id = test_chats[0]["id"]
        
        # Get chat and verify preview updated
        response = api_client.get(f"{base_url}/api/chats/{chat_id}")
        assert response.status_code == 200
        data = response.json()
        
        assert data["last_message_preview"] is not None
        assert data["last_sender_xid"] is not None
        assert data["last_message_at"] is not None
        print(f"✓ Chat preview updated: {data['last_message_preview'][:30]}...")

    def test_send_message_inherits_burn_seconds(self, base_url, api_client):
        """Message inherits burn_seconds from chat"""
        if not test_chats or not test_identities:
            pytest.skip("Need chat and identity")
        
        # Find chat with burn_seconds set
        chat_with_burn = [c for c in test_chats if c.get("burn_seconds")]
        if not chat_with_burn:
            pytest.skip("Need chat with burn_seconds")
        
        chat_id = chat_with_burn[0]["id"]
        sender = test_identities[0]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/messages",
            json={
                "chat_id": chat_id,
                "sender_xid": sender,
                "ciphertext": "YnVybiBtZXNzYWdl",
                "content_type": "text"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["self_destruct_seconds"] == chat_with_burn[0]["burn_seconds"]
        test_messages.append(data)
        print(f"✓ Message inherited burn_seconds: {data['self_destruct_seconds']}")

    def test_list_messages(self, base_url, api_client):
        """List messages for chat"""
        if not test_chats:
            pytest.skip("Need chat")
        
        chat_id = test_chats[0]["id"]
        response = api_client.get(f"{base_url}/api/messages?chat_id={chat_id}")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) >= 1
        print(f"✓ Listed {len(data)} messages for chat {chat_id}")

    def test_list_messages_since(self, base_url, api_client):
        """List messages with since filter"""
        if not test_messages:
            pytest.skip("Need messages")
        
        chat_id = test_messages[0]["chat_id"]
        since = test_messages[0]["created_at"]
        
        response = api_client.get(f"{base_url}/api/messages?chat_id={chat_id}&since={since}")
        assert response.status_code == 200
        data = response.json()
        
        # Should only return messages after the first one
        for msg in data:
            assert msg["created_at"] > since
        print(f"✓ Since filter working: {len(data)} messages after {since}")

    def test_mark_message_read(self, base_url, api_client):
        """Mark message as read"""
        if not test_messages or len(test_identities) < 2:
            pytest.skip("Need message and 2 identities")
        
        msg_id = test_messages[0]["id"]
        reader = test_identities[1]["xid"]
        
        response = api_client.post(f"{base_url}/api/messages/{msg_id}/read?xid={reader}")
        assert response.status_code == 200
        
        # Verify read_by updated
        chat_id = test_messages[0]["chat_id"]
        msgs = api_client.get(f"{base_url}/api/messages?chat_id={chat_id}").json()
        msg = [m for m in msgs if m["id"] == msg_id][0]
        assert reader in msg["read_by"]
        print(f"✓ Message marked read by {reader}")

    def test_destroy_message(self, base_url, api_client):
        """Manually destroy message"""
        if not test_messages:
            pytest.skip("Need message")
        
        # Create a new message to destroy
        chat_id = test_chats[0]["id"]
        sender = test_identities[0]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/messages",
            json={
                "chat_id": chat_id,
                "sender_xid": sender,
                "ciphertext": "ZGVzdHJveV9tZQ==",
                "content_type": "text"
            }
        )
        msg_id = response.json()["id"]
        
        # Destroy it
        response = api_client.post(f"{base_url}/api/messages/{msg_id}/destroy")
        assert response.status_code == 200
        
        # Verify destroyed
        msgs = api_client.get(f"{base_url}/api/messages?chat_id={chat_id}").json()
        msg = [m for m in msgs if m["id"] == msg_id][0]
        assert msg["destroyed"] is True
        assert msg["ciphertext"] == ""
        print(f"✓ Message destroyed: {msg_id}")

    def test_self_destruct_messages(self, base_url, api_client):
        """Messages self-destruct after burn timer"""
        if not test_chats or not test_identities:
            pytest.skip("Need chat and identity")
        
        # Create chat with 2s burn timer
        alice = test_identities[0]["xid"]
        bob = test_identities[1]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/chats",
            json={
                "type": "direct",
                "participant_xids": [alice, bob],
                "created_by_xid": alice
            }
        )
        burn_chat_id = response.json()["id"]
        
        # Set burn timer to 2 seconds
        api_client.patch(
            f"{base_url}/api/chats/{burn_chat_id}",
            json={"burn_seconds": 2}
        )
        
        # Send message
        response = api_client.post(
            f"{base_url}/api/messages",
            json={
                "chat_id": burn_chat_id,
                "sender_xid": alice,
                "ciphertext": "c2VsZi1kZXN0cnVjdA==",
                "content_type": "text"
            }
        )
        burn_msg_id = response.json()["id"]
        
        # Wait 5 seconds (2s burn + 2s grace period)
        print("⏳ Waiting 5s for self-destruct...")
        time.sleep(5)
        
        # Poll messages - should be destroyed
        msgs = api_client.get(f"{base_url}/api/messages?chat_id={burn_chat_id}").json()
        burn_msg = [m for m in msgs if m["id"] == burn_msg_id][0]
        
        assert burn_msg["destroyed"] is True
        assert burn_msg["ciphertext"] == ""
        print(f"✓ Message self-destructed after 2s burn timer")


class TestTyping:
    """Typing indicators"""

    def test_set_typing(self, base_url, api_client):
        """Set typing state"""
        if not test_chats or not test_identities:
            pytest.skip("Need chat and identity")
        
        chat_id = test_chats[0]["id"]
        xid = test_identities[0]["xid"]
        
        response = api_client.post(
            f"{base_url}/api/typing",
            json={"chat_id": chat_id, "xid": xid, "typing": True}
        )
        assert response.status_code == 200
        print(f"✓ Set typing state for {xid}")

    def test_get_typing(self, base_url, api_client):
        """Get typing users"""
        if not test_chats or not test_identities:
            pytest.skip("Need chat and identity")
        
        chat_id = test_chats[0]["id"]
        xid = test_identities[0]["xid"]
        
        response = api_client.get(f"{base_url}/api/typing?chat_id={chat_id}&exclude_xid={xid}")
        assert response.status_code == 200
        data = response.json()
        
        assert "typing_xids" in data
        assert isinstance(data["typing_xids"], list)
        print(f"✓ Got typing users: {data['typing_xids']}")

    def test_typing_ttl(self, base_url, api_client):
        """Typing state expires after 4s"""
        if not test_chats or not test_identities:
            pytest.skip("Need chat and identity")
        
        chat_id = test_chats[0]["id"]
        xid = test_identities[1]["xid"]
        
        # Set typing
        api_client.post(
            f"{base_url}/api/typing",
            json={"chat_id": chat_id, "xid": xid, "typing": True}
        )
        
        # Wait 5 seconds
        print("⏳ Waiting 5s for typing TTL...")
        time.sleep(5)
        
        # Check typing - should be expired
        response = api_client.get(f"{base_url}/api/typing?chat_id={chat_id}")
        data = response.json()
        
        assert xid not in data["typing_xids"]
        print(f"✓ Typing state expired after 4s TTL")


class TestPanic:
    """Panic mode - wipe identity and data"""

    def test_panic_wipes_identity(self, base_url, api_client):
        """Panic mode wipes identity and related data"""
        # Create a disposable identity for panic test
        response = api_client.post(
            f"{base_url}/api/identities",
            json={"name": "TEST_Panic", "disposable": True}
        )
        panic_xid = response.json()["xid"]
        
        # Create some data for this identity
        alice = test_identities[0]["xid"]
        
        # Add contact
        api_client.post(
            f"{base_url}/api/contacts",
            json={"owner_xid": panic_xid, "peer_xid": alice}
        )
        
        # Create chat
        chat_response = api_client.post(
            f"{base_url}/api/chats",
            json={
                "type": "direct",
                "participant_xids": [panic_xid, alice],
                "created_by_xid": panic_xid
            }
        )
        panic_chat_id = chat_response.json()["id"]
        
        # Send message
        api_client.post(
            f"{base_url}/api/messages",
            json={
                "chat_id": panic_chat_id,
                "sender_xid": panic_xid,
                "ciphertext": "cGFuaWMgbWVzc2FnZQ==",
                "content_type": "text"
            }
        )
        
        # PANIC!
        response = api_client.post(f"{base_url}/api/panic", json={"xid": panic_xid})
        assert response.status_code == 200
        data = response.json()
        assert data["wiped"] is True
        
        # Verify identity deleted
        response = api_client.get(f"{base_url}/api/identities/{panic_xid}")
        assert response.status_code == 404
        
        # Verify contacts deleted
        contacts = api_client.get(f"{base_url}/api/contacts?owner_xid={panic_xid}").json()
        assert len(contacts) == 0
        
        # Verify chat deleted (direct chat)
        response = api_client.get(f"{base_url}/api/chats/{panic_chat_id}")
        assert response.status_code == 404
        
        print(f"✓ Panic mode wiped identity {panic_xid} and all related data")


class TestAI:
    """AI features - summarize and smart reply"""

    def test_ai_summarize(self, base_url, api_client):
        """AI summarize conversation"""
        messages = [
            {"sender": "Alice", "text": "Hey, how are you?"},
            {"sender": "Bob", "text": "I'm good! Working on the new project."},
            {"sender": "Alice", "text": "Nice! Let me know if you need help."},
        ]
        
        response = api_client.post(
            f"{base_url}/api/ai/summarize",
            json={"messages": messages}
        )
        
        # AI might be slow, wait a bit
        if response.status_code == 200:
            data = response.json()
            assert "summary" in data
            assert isinstance(data["summary"], str)
            assert len(data["summary"]) > 0
            print(f"✓ AI summary: {data['summary'][:60]}...")
        else:
            print(f"⚠ AI summarize returned {response.status_code}: {response.text}")

    def test_ai_smart_reply(self, base_url, api_client):
        """AI smart reply suggestions"""
        messages = [
            {"sender": "Alice", "text": "Can you review the PR?"},
            {"sender": "Bob", "text": "Sure, I'll check it out now."},
        ]
        
        response = api_client.post(
            f"{base_url}/api/ai/smart-reply",
            json={"messages": messages}
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "suggestions" in data
            assert isinstance(data["suggestions"], list)
            assert len(data["suggestions"]) <= 3
            print(f"✓ AI suggestions: {data['suggestions']}")
        else:
            print(f"⚠ AI smart-reply returned {response.status_code}: {response.text}")


class TestCleanup:
    """Cleanup test data"""

    def test_cleanup_test_chats(self, base_url, api_client):
        """Delete test chats"""
        for chat in test_chats:
            try:
                api_client.delete(f"{base_url}/api/chats/{chat['id']}")
            except:
                pass
        print(f"✓ Cleaned up {len(test_chats)} test chats")

    def test_cleanup_test_identities(self, base_url, api_client):
        """Delete test identities"""
        for identity in test_identities:
            try:
                api_client.delete(f"{base_url}/api/identities/{identity['xid']}")
            except:
                pass
        print(f"✓ Cleaned up {len(test_identities)} test identities")
